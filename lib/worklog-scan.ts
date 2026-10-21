import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listGoals } from "@/lib/store";
import { readJson, writeJson } from "@/lib/blob";
import { ingestWorklog } from "@/lib/worklog";
import { GOAL_STATUS } from "@/lib/types";

// サーバー自身が Claude Code のセッション記録(~/.claude/projects)を走査し、
// 作業フォルダ(repoPath)が一致するゴールへ新しい作業ログを取り込む。
// Claude Code の Stop フックに依存せず、アプリが開いている間ずっと定期的に拾える。
//
// 状態（どこまで取り込んだか）は blob ストアに保存する（ローカルのパス依存を避けるため）。

const STATE_KEY = "worklog-state.json";

interface WorklogState {
  // 処理済みの行数（セッションjsonlは追記型なので行オフセットで差分を取るのが確実）。
  [goalId: string]: { lastLine: number; lastMtime: number };
}

// 二重起動防止（AI算出は重いので、同時に走らせない）。
let running = false;
let lastRunAt = 0;
const MIN_INTERVAL_MS = 20_000; // 連続呼び出しの最小間隔

// jsonl 本文から、最初に cwd を持つ行の cwd を返す（無ければ null）。
// 先頭行は cwd を持たないメタ行のことがあるので、見つかるまで数十行走査する。
function readCwd(raw: string): string | null {
  const lines = raw.split("\n");
  const limit = Math.min(lines.length, 80);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      const cwd = (JSON.parse(line) as { cwd?: string })?.cwd;
      if (cwd) return cwd;
    } catch {
      /* 壊れた行はスキップ */
    }
  }
  return null;
}

// 作業フォルダ(cwd) → そのフォルダで最後に更新されたセッションファイルの索引。
async function buildSessionIndex(): Promise<Map<string, { fp: string; mtime: number }>> {
  const root = path.join(os.homedir(), ".claude", "projects");
  const index = new Map<string, { fp: string; mtime: number }>();
  if (!existsSync(root)) return index;
  let dirs: string[] = [];
  try {
    dirs = await readdir(root);
  } catch {
    return index;
  }
  for (const dir of dirs) {
    const full = path.join(root, dir);
    let files: string[] = [];
    try {
      files = (await readdir(full)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const fp = path.join(full, f);
      try {
        const cwd = readCwd(await readFile(fp, "utf8"));
        if (!cwd) continue;
        const key = path.resolve(cwd).toLowerCase();
        const s = await stat(fp);
        const prev = index.get(key);
        if (!prev || s.mtimeMs > prev.mtime) index.set(key, { fp, mtime: s.mtimeMs });
      } catch {
        /* 壊れたファイルはスキップ */
      }
    }
  }
  return index;
}

// jsonl の fromLine 行目以降（＝未処理分）から、アシスタント発言・ツール使用・人間の発言を
// 抽出して作業ログ化する。戻り値の totalLines は、このファイルの総行数（次回の起点に保存）。
function extractWorklog(
  raw: string,
  fromLine: number,
): { text: string; totalLines: number } {
  const lines = raw.split("\n");
  // ファイルが短くなった（想定外のローテート等）場合は先頭から読み直す。
  const start = fromLine > 0 && fromLine <= lines.length ? fromLine : 0;
  const parts: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let ev: { type?: string; message?: { content?: unknown } };
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const content = ev.message?.content;
    if (ev.type === "assistant" && Array.isArray(content)) {
      for (const b of content as Array<{ type?: string; text?: string; name?: string }>) {
        if (b.type === "text" && b.text?.trim()) parts.push(b.text.trim());
        else if (b.type === "tool_use") parts.push(`[ツール: ${b.name}]`);
      }
    } else if (ev.type === "user") {
      if (typeof content === "string" && content.trim()) {
        parts.push(`[人] ${content.trim()}`);
      } else if (Array.isArray(content)) {
        for (const b of content as Array<{ type?: string; text?: string }>) {
          if (b.type === "text" && b.text?.trim()) parts.push(`[人] ${b.text.trim()}`);
        }
      }
    }
  }
  return { text: parts.join("\n").slice(0, 8000), totalLines: lines.length };
}

export interface SyncSummary {
  scanned: number; // repoPath を持つ対象ゴール数
  synced: { goalId: string; title: string; appliedTo?: string }[];
  skipped: string; // 補足メッセージ
}

// 作業ログ同期の本体。アプリ（ローカル）が開いている間、定期的に呼ばれる想定。
export async function runWorklogSync(): Promise<SyncSummary> {
  // リモート(Linux/デプロイ)では利用者PCのセッションを読めないので何もしない。
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return { scanned: 0, synced: [], skipped: "この環境では同期対象がありません" };
  }
  if (running) return { scanned: 0, synced: [], skipped: "同期実行中" };
  if (Date.now() - lastRunAt < MIN_INTERVAL_MS) {
    return { scanned: 0, synced: [], skipped: "直近に実行済み" };
  }
  running = true;
  lastRunAt = Date.now();
  try {
    const goals = (await listGoals()).filter(
      (g) => g.repoPath && g.repoPath.trim() && g.status !== GOAL_STATUS.done,
    );
    if (goals.length === 0) {
      return { scanned: 0, synced: [], skipped: "repoPath設定のゴールがありません" };
    }

    const index = await buildSessionIndex();
    const state = await readJson<WorklogState>(STATE_KEY, {});
    const synced: SyncSummary["synced"] = [];

    for (const goal of goals) {
      const hit = index.get(path.resolve(goal.repoPath).toLowerCase());
      if (!hit) continue; // このフォルダで作業したセッションが無い

      const prev = state[goal.id];
      // mtime が進んでいなければ新規なし（読み直さない）。
      if (prev && hit.mtime <= prev.lastMtime) continue;

      let raw: string;
      try {
        raw = await readFile(hit.fp, "utf8");
      } catch {
        continue;
      }
      const { text, totalLines } = extractWorklog(raw, prev?.lastLine ?? 0);
      if (!text.trim()) {
        // 新規発言は無いが mtime は進んだ → 次回の無駄読みを避けるため記録だけ更新。
        state[goal.id] = { lastLine: totalLines, lastMtime: hit.mtime };
        continue;
      }

      const result = await ingestWorklog(goal.id, text, "Claude Code").catch(() => null);
      // 取り込んだところまで行オフセットを進める（同じログを二度取り込まない）。
      state[goal.id] = { lastLine: totalLines, lastMtime: hit.mtime };
      if (result?.ok) {
        synced.push({ goalId: goal.id, title: goal.title, appliedTo: result.appliedTo });
      }
    }

    await writeJson(STATE_KEY, state);
    return {
      scanned: goals.length,
      synced,
      skipped: synced.length === 0 ? "新しい作業ログはありません" : "",
    };
  } finally {
    running = false;
  }
}

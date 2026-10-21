// 作業ログ取得：Claude Code(CLI) のセッション記録から「作業ログ」を抽出し、
// 進捗管理AI へ送信する。受け取った側(/api/goals/<id>/worklog)が
// 進捗％と完了見込みをAIで算出してゴールへ反映する。
//
// 仕組み:
//   Claude Code は会話を ~/.claude/projects/<エンコードされたcwd>/<session>.jsonl に記録する。
//   各行には cwd が入っているので、対象ゴールの作業フォルダ(repoPath)と一致する最新の
//   セッションを見つけ、前回取得以降の新しい発言・ツール使用を要約して送る。
//
// 使い方:
//   node scripts/作業ログ取得.mjs --goal <ゴールID> [--base http://localhost:3000]
//   （--goal 省略時は進捗管理AIの「作業中(active)」ゴールを使う）
//   Claude Code の Stop フックや、定期実行(タスクスケジューラ)から回す想定。

import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = (arg("base", process.env.PROGRESS_BASE) || "http://localhost:3000").replace(/\/$/, "");
const SELF = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const STATE_FILE = path.join(path.dirname(SELF), ".worklog-state.json");

// --detach: 自分自身をバックグラウンドで起動し即終了する。
// Claude Code の Stop フックから呼んでも、実装終了を待たせない（AI算出は裏で進む）。
if (process.argv.includes("--detach")) {
  const { spawn } = await import("node:child_process");
  const rest = process.argv.slice(2).filter((a) => a !== "--detach");
  const child = spawn(process.execPath, [SELF, ...rest], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  process.exit(0);
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET失敗 ${res.status}: ${url}`);
  return res.json();
}
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST失敗 ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
async function saveState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// ~/.claude/projects 配下の全 jsonl を1回だけ走査し、
// 「作業フォルダ(cwd) → そのフォルダで最後に更新されたセッションファイル」の索引を作る。
// これで『作業中(active)ゴール』の手動設定なしに、repoPath 一致だけで宛先を決められる。
async function buildSessionIndex() {
  const root = path.join(os.homedir(), ".claude", "projects");
  const index = new Map(); // key: 正規化した作業フォルダ(小文字) → { fp, mtime }
  if (!existsSync(root)) return index;
  for (const dir of await readdir(root)) {
    const full = path.join(root, dir);
    let files = [];
    try {
      files = (await readdir(full)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const fp = path.join(full, f);
      try {
        // cwd は先頭行とは限らない（新しい形式では last-prompt / mode 等のメタ行が先頭に来て
        // cwd を持たない）。cwd が現れる最初の行まで走査して取得する。
        const cwd = readCwd(await readFile(fp, "utf8"));
        if (!cwd) continue;
        const key = path.resolve(cwd).toLowerCase();
        const s = await stat(fp);
        const prev = index.get(key);
        if (!prev || s.mtimeMs > prev.mtime) index.set(key, { fp, mtime: s.mtimeMs });
      } catch {
        /* 壊れた行/ファイルはスキップ */
      }
    }
  }
  return index;
}

// jsonl 本文から、最初に cwd を持つ行の cwd を返す（無ければ null）。
// 先頭数十行だけ見れば十分（最初のユーザーメッセージに入っている）。
function readCwd(raw) {
  const lines = raw.split("\n");
  const limit = Math.min(lines.length, 60);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      const cwd = JSON.parse(line)?.cwd;
      if (cwd) return cwd;
    } catch {
      /* 壊れた行はスキップ */
    }
  }
  return null;
}

// jsonl から、前回取得時刻以降のアシスタント発言・ツール使用を抽出して作業ログ化する。
async function extractWorklog(file, sinceISO) {
  const raw = await readFile(file, "utf8");
  const since = sinceISO ? Date.parse(sinceISO) : 0;
  const parts = [];
  let last = sinceISO || null;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = ev.timestamp ? Date.parse(ev.timestamp) : 0;
    if (ts && ts <= since) continue;
    if (ts) last = ev.timestamp;
    const msg = ev.message;
    const content = msg?.content;
    if (ev.type === "assistant" && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === "text" && b.text?.trim()) parts.push(b.text.trim());
        else if (b.type === "tool_use") parts.push(`[ツール: ${b.name}]`);
      }
    } else if (ev.type === "user") {
      // 人間の指示・やり取りも拾う（子ゴールや完了基準の変更など、
      // 作業中の人との合意をAIが反映できるようにするため）。
      // tool_result（ツールの実行結果）はノイズになりやすいので除外する。
      if (typeof content === "string" && content.trim()) {
        parts.push(`[人] ${content.trim()}`);
      } else if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type === "text" && b.text?.trim()) parts.push(`[人] ${b.text.trim()}`);
        }
      }
    }
  }
  return { text: parts.join("\n").slice(0, 8000), last };
}

// 送信対象のゴール群を決める。
//   --goal 指定時: そのゴールのみ（手動・従来互換）。
//   省略時     : repoPath が設定され、未完了のゴール全部（＝フォルダ一致で自動判定）。
async function resolveTargetGoals() {
  const goalArg = arg("goal", process.env.GOAL_ID);
  if (goalArg) {
    const g = await getJson(`${BASE}/api/goals/${goalArg}`)
      .then((d) => d.goal ?? d)
      .catch(() => null);
    return g ? [g] : [];
  }
  const all = await getJson(`${BASE}/api/goals`)
    .then((d) => d.goals ?? [])
    .catch(() => []);
  return all.filter(
    (g) => g.repoPath && String(g.repoPath).trim() && g.status !== "done",
  );
}

async function main() {
  const [goals, index, state] = await Promise.all([
    resolveTargetGoals(),
    buildSessionIndex(),
    loadState(),
  ]);

  if (goals.length === 0) {
    console.log("[作業ログ取得] 対象ゴールがありません（repoPath未設定 等）");
    return;
  }

  let sent = 0;
  for (const goal of goals) {
    if (!goal.repoPath) continue;
    // 作業フォルダ(repoPath)に一致する最新セッションを索引から引く＝このゴールが「作業中」。
    const hit = index.get(path.resolve(goal.repoPath).toLowerCase());
    if (!hit) continue; // このフォルダで作業したClaude Codeセッションが無い

    const sinceISO = state[goal.id]?.lastTimestamp || null;
    const { text, last } = await extractWorklog(hit.fp, sinceISO);
    if (!text.trim()) continue; // 前回以降の新しい作業なし

    try {
      const r = await postJson(`${BASE}/api/goals/${goal.id}/worklog`, {
        log: text,
        source: "Claude Code",
      });
      console.log(
        `[作業ログ取得] 送信: ${goal.title} → 進捗${r.progress ?? "—"}% / 見込み: ${r.forecast || "—"}` +
          (r.appliedTo ? `（反映先: ${r.appliedTo}）` : ""),
      );
      state[goal.id] = {
        lastTimestamp: last || new Date(await latestMtime(hit.fp)).toISOString(),
      };
      sent += 1;
    } catch (e) {
      console.error(`[作業ログ取得] ${goal.title} 送信失敗: ${e.message}`);
    }
  }

  await saveState(state);
  if (sent === 0) console.log("[作業ログ取得] 新しい作業ログはありません");
}

async function latestMtime(file) {
  const s = await stat(file);
  return s.mtimeMs;
}

main().catch((e) => {
  console.error("[作業ログ取得] エラー:", e.message);
  process.exit(1);
});

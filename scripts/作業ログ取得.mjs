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
const STATE_FILE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), ".worklog-state.json");

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

// 対象ゴールIDと repoPath を解決する。
async function resolveGoal() {
  let goalId = arg("goal", process.env.GOAL_ID);
  if (!goalId) {
    // 作業中(active)ゴールを使う。
    try {
      const ctx = await getJson(`${BASE}/api/context`);
      goalId = ctx?.activeGoalId || ctx?.active?.id || null;
    } catch {
      /* noop */
    }
  }
  if (!goalId) throw new Error("ゴールIDが不明です（--goal で指定、または作業中ゴールを設定してください）");
  const goal = await getJson(`${BASE}/api/goals/${goalId}`).then((d) => d.goal ?? d);
  if (!goal) throw new Error("ゴールが取得できません");
  return goal;
}

// ~/.claude/projects 配下の jsonl から、cwd が repoPath に一致する最新ファイルを探す。
async function findSessionFile(repoPath) {
  const root = path.join(os.homedir(), ".claude", "projects");
  if (!existsSync(root)) return null;
  const want = path.resolve(repoPath).toLowerCase();
  const candidates = [];
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
        const head = (await readFile(fp, "utf8")).split("\n").find((l) => l.trim());
        if (!head) continue;
        const cwd = JSON.parse(head)?.cwd;
        if (cwd && path.resolve(cwd).toLowerCase() === want) {
          const s = await stat(fp);
          candidates.push({ fp, mtime: s.mtimeMs });
        }
      } catch {
        /* 壊れた行はスキップ */
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.fp ?? null;
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
    }
  }
  return { text: parts.join("\n").slice(0, 8000), last };
}

async function main() {
  const goal = await resolveGoal();
  const repoPath = goal.repoPath;
  if (!repoPath) throw new Error(`ゴール「${goal.title}」に作業フォルダ(repoPath)が未設定です`);

  const file = await findSessionFile(repoPath);
  if (!file) {
    console.log(`[作業ログ取得] ${repoPath} に対応するClaude Codeセッションが見つかりません`);
    return;
  }

  const state = await loadState();
  const sinceISO = state[goal.id]?.lastTimestamp || null;
  const { text, last } = await extractWorklog(file, sinceISO);
  if (!text.trim()) {
    console.log("[作業ログ取得] 新しい作業ログはありません");
    return;
  }

  const r = await postJson(`${BASE}/api/goals/${goal.id}/worklog`, {
    log: text,
    source: "Claude Code",
  });
  console.log(
    `[作業ログ取得] 送信完了: ${goal.title} → 進捗${r.progress ?? "—"}% / 完了見込み: ${r.forecast || "—"}`,
  );

  state[goal.id] = { lastTimestamp: last || new Date(await latestMtime(file)).toISOString() };
  await saveState(state);
}

async function latestMtime(file) {
  const s = await stat(file);
  return s.mtimeMs;
}

main().catch((e) => {
  console.error("[作業ログ取得] エラー:", e.message);
  process.exit(1);
});

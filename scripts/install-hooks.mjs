#!/usr/bin/env node
// git の post-commit フックを導入する。
// 実行: node scripts/install-hooks.mjs  （または npm run hooks:install）
import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { installStopHook } from "./worklog-hook.mjs";

let gitDir;
try {
  gitDir = execSync("git rev-parse --git-dir", { encoding: "utf8" }).trim();
} catch {
  console.error("gitリポジトリではありません。先に `git init` を実行してください。");
  process.exit(1);
}

const hooksDir = path.resolve(gitDir, "hooks");
if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

const reportScript = path.resolve(process.cwd(), "scripts", "report-commit.mjs");
const hookPath = path.join(hooksDir, "post-commit");

// POSIX sh フック（Git for Windows も Git Bash 上で sh を使う）。
const hook = `#!/bin/sh
# 進捗管理AI: コミットを作業中ゴールへ自動記録
node "${reportScript.replace(/\\/g, "/")}" </dev/null 2>&1 || true
`;

writeFileSync(hookPath, hook, "utf8");
try {
  chmodSync(hookPath, 0o755);
} catch {
  // Windowsでは無視
}

console.log(`post-commit フックを導入しました: ${hookPath}`);
console.log("以後、コミットするたびに作業中ゴールへ自動記録されます。");

// Claude Code の Stop フックも導入（作業終了ごとに作業ログを自動送信）。
try {
  const base = process.env.PROGRESS_BASE || "http://localhost:3000";
  const { settingsPath } = await installStopHook(base);
  console.log(`Claude Code の Stop フックを導入しました: ${settingsPath}`);
  console.log("以後、Claude Codeが作業を終えるたびに作業ログが自動送信されます（要: Claude Code再起動）。");
} catch (e) {
  console.warn("Stopフックの導入に失敗（手動で `node scripts/worklog-hook.mjs` 実行可）:", e.message);
}

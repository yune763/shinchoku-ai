#!/usr/bin/env node
// git の post-commit フックを導入する。
// 実行: node scripts/install-hooks.mjs  （または npm run hooks:install）
import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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

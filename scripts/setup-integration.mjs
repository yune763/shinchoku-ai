// インストール時の自動連携セットアップ。
//   - git post-commit フック（コミットで作業中ゴールへ自動記録）
//   - Claude Code の Stop フック（作業終了ごとに作業ログを自動送信）
//   - shinchoku MCP を Claude Code / Cursor に登録（全プロジェクトで使える）
// これにより、Claude Code / Cursor から「作業ログを自分で進捗管理AIへ渡す」準備が整う。
//
// 使い方: node scripts/setup-integration.mjs [--base http://localhost:3000]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installStopHook } from "./worklog-hook.mjs";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS, "..");
const SERVER = path.join(ROOT, "mcp", "server.mjs");
const bi = process.argv.indexOf("--base");
const BASE = (bi >= 0 && process.argv[bi + 1] ? process.argv[bi + 1] : "http://localhost:3000").replace(/\/$/, "");

const log = (m) => console.log(`[連携] ${m}`);
const warn = (m) => console.warn(`[連携] ${m}`);

// 1) git post-commit フック
try {
  const gitDir = execSync("git rev-parse --git-dir", { cwd: ROOT, encoding: "utf8" }).trim();
  const hooksDir = path.isAbsolute(gitDir) ? path.join(gitDir, "hooks") : path.join(ROOT, gitDir, "hooks");
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  const reportScript = path.join(ROOT, "scripts", "report-commit.mjs");
  const hook = `#!/bin/sh\n# 進捗管理AI: コミットを作業中ゴールへ自動記録\nnode "${reportScript.replace(/\\/g, "/")}" </dev/null 2>&1 || true\n`;
  writeFileSync(path.join(hooksDir, "post-commit"), hook, "utf8");
  try { chmodSync(path.join(hooksDir, "post-commit"), 0o755); } catch {}
  log("git post-commit フックを導入しました");
} catch (e) {
  warn(`post-commit の導入に失敗: ${e.message}`);
}

// 2) Claude Code の Stop フック（作業ログ自動送信）
try {
  const { settingsPath } = await installStopHook(BASE);
  log(`Claude Code の Stop フックを導入しました: ${settingsPath}`);
} catch (e) {
  warn(`Stop フックの導入に失敗: ${e.message}`);
}

// 3) Claude Code CLI へ shinchoku MCP を登録（ユーザースコープ=全プロジェクト）
try {
  try { execSync("claude mcp remove -s user shinchoku", { stdio: "ignore" }); } catch {}
  execSync(`claude mcp add -s user shinchoku --env SHINCHOKU_BASE_URL=${BASE} -- node "${SERVER}"`, { stdio: "ignore" });
  log("Claude Code に shinchoku MCP を登録しました（全プロジェクト）");
} catch {
  warn("Claude Code CLI が未導入、または MCP 登録に失敗（後で connect.mjs でも可）");
}

// 4) Cursor へ shinchoku MCP を登録（~/.cursor/mcp.json・全プロジェクト）
try {
  const cfgPath = path.join(os.homedir(), ".cursor", "mcp.json");
  let cfg = {};
  try { cfg = JSON.parse(await readFile(cfgPath, "utf8")); } catch {}
  if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") cfg.mcpServers = {};
  cfg.mcpServers.shinchoku = {
    command: "node",
    args: [SERVER],
    env: { SHINCHOKU_BASE_URL: BASE },
  };
  await mkdir(path.dirname(cfgPath), { recursive: true });
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
  log(`Cursor に shinchoku MCP を登録しました（全プロジェクト）: ${cfgPath}`);
} catch (e) {
  warn(`Cursor への MCP 登録に失敗: ${e.message}`);
}

console.log("");
log("連携設定が完了しました。Claude Code / Cursor を再起動すると有効になります。");
log("以後、実装を一区切りすると submit_worklog（Cursor）/ Stopフック（Claude Code）で");
log("作業ログが進捗管理AIへ自動で渡され、進捗・子タスクが更新されます。");

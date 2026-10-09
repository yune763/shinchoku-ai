// Claude Code の Stop フックを ~/.claude/settings.json に登録する。
// Claude Code が作業を終えるたびに「作業ログ取得.mjs --detach」を実行し、
// 作業中ゴールへ作業ログを送って進捗・子タスクを自動更新する。
//
// 使い方:
//   import { installStopHook } from "./worklog-hook.mjs";
//   await installStopHook("http://localhost:3000");
//   または単体実行: node scripts/worklog-hook.mjs [--base <URL>]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKLOG_SCRIPT = path.join(SCRIPTS_DIR, "作業ログ取得.mjs");

// Stop フックのコマンド文字列。--detach で即終了（Claude Codeを待たせない）。
function buildCommand(baseUrl) {
  return `node "${WORKLOG_SCRIPT}" --detach --base ${baseUrl}`;
}

// 既存の settings.json を壊さずに Stop フックをマージする（冪等）。
export async function installStopHook(baseUrl = "http://localhost:3000") {
  const base = baseUrl.replace(/\/$/, "");
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const command = buildCommand(base);

  let settings = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"));
  } catch {
    settings = {};
  }
  if (!settings.hooks || typeof settings.hooks !== "object") settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];

  // 既存の「作業ログ取得」Stopフックは一旦除去して入れ直す（URL更新・重複防止）。
  settings.hooks.Stop = settings.hooks.Stop.filter((group) => {
    const cmds = (group?.hooks ?? []).map((h) => h?.command ?? "");
    return !cmds.some((c) => c.includes("作業ログ取得.mjs"));
  });
  settings.hooks.Stop.push({
    hooks: [{ type: "command", command }],
  });

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  return { settingsPath, command };
}

// 単体実行時。
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--base");
  const base = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://localhost:3000";
  installStopHook(base)
    .then(({ settingsPath }) => {
      console.log(`Claude Code の Stop フックを登録しました: ${settingsPath}`);
      console.log("以後、Claude Codeが作業を終えるたびに作業ログが自動送信されます。");
      console.log("※反映には Claude Code / Cursor の再起動が必要です。");
    })
    .catch((e) => {
      console.error("Stopフックの登録に失敗:", e.message);
      process.exit(1);
    });
}

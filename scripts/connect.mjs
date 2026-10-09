#!/usr/bin/env node
// 同僚PC用: 自分の Claude Code を中央の進捗管理AIへ接続する。
//   使い方: node scripts/connect.mjs <中央URL> ["あなたの名前"]
//   例    : node scripts/connect.mjs https://xxxx.trycloudflare.com "山田太郎"
//
// やること:
//   1) 接続確認（中央URLの /api/context に到達できるか）
//   2) Claude Code に shinchoku MCP を登録（SHINCHOKU_BASE_URL=中央URL）
//   失敗してもデータは壊さない（案内を出して終了）。

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installStopHook } from "./worklog-hook.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [, , urlArg, nameArg] = process.argv;

function fail(msg) {
  console.error(`\n[connect] エラー: ${msg}\n`);
  process.exit(1);
}

if (!urlArg) {
  fail('中央URLが必要です。例: node scripts/connect.mjs https://xxxx.trycloudflare.com "山田太郎"');
}

const baseUrl = urlArg.replace(/\/$/, "");
const name = (nameArg || "").trim();
const serverPath = path.join(ROOT, "mcp", "server.mjs");

console.log(`[connect] 中央URL: ${baseUrl}`);

// 1) 到達性チェック
try {
  const res = await fetch(`${baseUrl}/api/context`);
  if (!res.ok) {
    console.warn(`[connect] 警告: ${baseUrl}/api/context が ${res.status} を返しました（認証が有効/未起動の可能性）。`);
  } else {
    const ctx = await res.json().catch(() => ({}));
    const next = ctx?.recommendedNext?.[0]?.title;
    console.log(`[connect] 接続OK。${next ? `次に着手すべきゴール: ${next}` : ""}`);
  }
} catch (e) {
  console.warn(`[connect] 警告: 中央URLへ到達できませんでした（${e.message}）。ホスト側の起動/トンネルを確認してください。`);
}

// 2) Claude Code へ MCP 登録
const envJson = JSON.stringify({ SHINCHOKU_BASE_URL: baseUrl });
try {
  // 既存の同名登録があれば一度消してから入れ直す（冪等化）。
  try {
    execSync(`claude mcp remove shinchoku`, { stdio: "ignore" });
  } catch {
    // 無ければ無視
  }
  execSync(
    `claude mcp add shinchoku --env SHINCHOKU_BASE_URL=${baseUrl} -- node "${serverPath}"`,
    { stdio: "inherit" },
  );
  console.log(`\n[connect] Claude Code に shinchoku MCP を登録しました。`);
} catch (e) {
  console.warn(
    `\n[connect] 'claude mcp add' を自動実行できませんでした（${e.message}）。\n` +
      `手動で次を実行してください:\n` +
      `  claude mcp add shinchoku --env SHINCHOKU_BASE_URL=${baseUrl} -- node "${serverPath}"\n` +
      `または Cursor の MCP設定に command=node / args=["${serverPath.replace(/\\/g, "/")}"] / env=${envJson} を登録。`,
  );
}

// 3) Claude Code の Stop フックを導入（作業終了ごとに作業ログを自動送信）
try {
  const { settingsPath } = await installStopHook(baseUrl);
  console.log(`[connect] Stopフックを導入しました: ${settingsPath}`);
  console.log("  → Claude Codeが作業を終えるたびに、作業中ゴールへ作業ログを自動送信します。");
} catch (e) {
  console.warn(`[connect] Stopフックの導入に失敗（${e.message}）。手動で次を実行:`);
  console.warn(`  node "${path.join(ROOT, "scripts", "worklog-hook.mjs")}" --base ${baseUrl}`);
}

console.log(`
[connect] 完了。次の手順:
  1) Claude Code / Cursor を再起動（MCPを読み込ませる）。
  2) 新しいセッションで「/progress」または get_context を呼ぶと中央の現在地が出ます。
  3) 作業を進めたら set_active_goal / add_log / set_step_done で中央へ記録されます。
     ${name ? `（記録者名の目安: ${name}）` : ""}
`);

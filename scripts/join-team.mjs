#!/usr/bin/env node
// 招待キーからチーム連携をセットアップする。
//   使い方: npm run join -- <招待キー> "あなたの名前"
// 招待キーは連携済みPCの「メンバー」→「メンバーを招待」で発行できる。
// このスクリプトは .env に MEMBER_ID / MEMBER_NAME / TEAM_SYNC_DIR を書き込む。

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env");

function fail(msg) {
  console.error(`\n[join] エラー: ${msg}\n`);
  process.exit(1);
}

const [, , keyArg, nameArg] = process.argv;
if (!keyArg) {
  fail('招待キーが必要です。例: npm run join -- <キー> "山田太郎"');
}

// キーを復号（base64url の JSON）。
let payload;
try {
  const json = Buffer.from(keyArg, "base64url").toString("utf8");
  payload = JSON.parse(json);
} catch {
  fail("招待キーの形式が不正です。コピーミスがないか確認してください。");
}
if (!payload || typeof payload.syncDir !== "string" || !payload.syncDir) {
  fail("招待キーに共有フォルダの情報が含まれていません。");
}

const syncDir = payload.syncDir;
const name = (nameArg || "").trim();
if (!name) {
  fail('表示名が必要です。例: npm run join -- <キー> "山田太郎"');
}

// メンバーIDは PC ごとに一意にする（名前スラッグ＋短いランダム）。
const slug =
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16) || "member";
const memberId = `${slug}-${randomUUID().slice(0, 8)}`;

const updates = {
  MEMBER_ID: memberId,
  MEMBER_NAME: name,
  TEAM_SYNC_DIR: syncDir,
};

// 既存 .env を保持しつつ、対象キーだけ置換／追記する。
let existing = "";
try {
  existing = await fs.readFile(ENV_FILE, "utf8");
} catch {
  // 無ければ新規作成。
}

const lines = existing.length ? existing.split(/\r?\n/) : [];
const seen = new Set();
const out = lines.map((line) => {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
  if (m && updates[m[1]] !== undefined) {
    seen.add(m[1]);
    return `${m[1]}=${quote(updates[m[1]])}`;
  }
  return line;
});
for (const [k, v] of Object.entries(updates)) {
  if (!seen.has(k)) out.push(`${k}=${quote(v)}`);
}
// 末尾の空行を整える。
const content = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "") + "\n";

await fs.writeFile(ENV_FILE, content, "utf8");

// 値に空白等が含まれる場合はクオートする。
function quote(v) {
  return /[\s#"']/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

console.log(`
[join] チーム連携を設定しました。
  表示名        : ${name}
  メンバーID    : ${memberId}
  共有フォルダ  : ${syncDir}

次の手順:
  1) 共有フォルダ「${syncDir}」がこのPCから見えるか確認（OneDrive/Dropbox/ネットワークドライブ等）。
  2) 開発サーバーを再起動: npm run dev
  3) 「メンバー」を開くと、あなたと他メンバーが相互に表示されます。
`);

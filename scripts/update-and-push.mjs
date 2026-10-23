#!/usr/bin/env node
// 情報収集 / SNS情報収集 / 開発提案 を生成し、アプリの保存先(Turso)へ直接取り込む。
// 1) build-collection / build-sns-collection / build-proposals を実行して
//    ローカル data/*.json を最新化する（個別失敗は記録して続行）。
// 2) 生成された data/*.json を Turso の kv テーブルへ upsert する
//    （キー名・テーブル構成は lib/blob.ts と一致させる）。
//
// アプリ(Electron/Render)の起動状態に依存せず、共有DBへ直接書くため最も確実。
// 実行: node scripts/update-and-push.mjs   （.env の TURSO_* を使用）

import { readFile, appendFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..");
const LOG_FILE = path.join(APP_ROOT, "data", "update.log");

// lib/blob.ts と同じキー名（1キー=1JSONファイル相当）。
const TARGETS = [
  { build: "build-collection.mjs", file: "collection.json" },
  { build: "build-sns-collection.mjs", file: "sns-collection.json" },
  { build: "build-proposals.mjs", file: "proposals.json" },
];

// スケジューラ実行(標準出力が捨てられる)でも追えるよう、data/update.log にも追記する。
function log(msg) {
  const line = `[update-and-push] ${new Date().toISOString()} ${msg}`;
  console.log(line);
  // 失敗してもログ書き込み自体で処理を止めない。
  appendFile(LOG_FILE, line + "\n").catch(() => {});
}

// .env を最小パース（KEY=VALUE、#コメント・前後の引用符を無視）。
async function loadEnv() {
  const env = {};
  let text = "";
  try {
    text = await readFile(path.join(APP_ROOT, ".env"), "utf8");
  } catch {
    return env; // .env が無ければ process.env にフォールバック
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

// 生成スクリプトを1本実行（失敗しても例外にせず結果を返す）。
function runBuild(script) {
  const r = spawnSync(process.execPath, [path.join(here, script)], {
    cwd: APP_ROOT,
    encoding: "utf8",
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (out) for (const l of out.split(/\r?\n/)) log(`  ${script}: ${l}`);
  return r.status === 0;
}

async function main() {
  await mkdir(path.dirname(LOG_FILE), { recursive: true }).catch(() => {});
  const env = { ...process.env, ...(await loadEnv()) };
  const url = (env.TURSO_DATABASE_URL || "").trim();
  const authToken = (env.TURSO_AUTH_TOKEN || "").trim();
  if (!url || !authToken) {
    log("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定のため中止");
    process.exit(1);
  }

  // 1) 生成（個別失敗は続行）。
  for (const t of TARGETS) {
    const ok = runBuild(t.build);
    log(`${t.build} => ${ok ? "OK" : "失敗(続行)"}`);
  }

  // 2) Turso へ取り込み（lib/blob.ts と同じテーブル/キー）。
  const db = createClient({ url, authToken });
  await db.execute(
    "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, raw TEXT, updated_at TEXT)",
  );

  let pushed = 0;
  for (const t of TARGETS) {
    let raw;
    try {
      raw = await readFile(path.join(APP_ROOT, "data", t.file), "utf8");
    } catch (e) {
      log(`${t.file} 読み込み不可のためスキップ: ${e.message}`);
      continue;
    }
    // JSON健全性チェック（壊れたデータを共有DBに入れない）。
    let count = "?";
    try {
      const parsed = JSON.parse(raw);
      count = Array.isArray(parsed) ? parsed.length : "object";
    } catch {
      log(`${t.file} がJSONとして不正のためスキップ`);
      continue;
    }
    await db.execute({
      sql: "INSERT INTO kv (key, raw, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET raw = excluded.raw, updated_at = excluded.updated_at",
      args: [t.file, raw, new Date().toISOString()],
    });
    pushed += 1;
    log(`${t.file} を Turso に取り込み (件数: ${count})`);
  }

  log(`完了: ${pushed}/${TARGETS.length} 件を取り込み`);
}

main().catch((e) => {
  log(`想定外のエラー: ${e?.stack || e}`);
  process.exit(1);
});

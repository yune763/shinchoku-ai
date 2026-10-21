#!/usr/bin/env node
// Firestore に入っている全データを Turso(libSQL) へ移行する一度きりのスクリプト。
//   使い方（.env に FIREBASE_SERVICE_ACCOUNT と TURSO_DATABASE_URL/TURSO_AUTH_TOKEN を設定して）:
//     node --env-file=.env scripts/migrate-to-turso.mjs
//   既定では Turso 側に既に中身があるキーは上書きしない（--force で上書き）。
//
// blob 層は「1キー = JSON文字列(raw)」で保存している。Firestore では
// コレクション(FIRESTORE_COLLECTION)の各ドキュメント(id=キー, field raw)に、
// Turso では kv(key, raw, updated_at) に対応する。
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@libsql/client";

const force = process.argv.includes("--force");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) {
  console.error("FIREBASE_SERVICE_ACCOUNT が未設定です（node --env-file=.env で実行してください）。");
  process.exit(1);
}
const url = (process.env.TURSO_DATABASE_URL || "").trim();
const token = (process.env.TURSO_AUTH_TOKEN || "").trim();
if (!url || !token) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定です（.env に追加してください）。");
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(sa), projectId: sa.project_id });
const fs = getFirestore();
const COLLECTION = process.env.FIRESTORE_COLLECTION || "shinchoku";

const turso = createClient({ url, authToken: token });
await turso.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, raw TEXT, updated_at TEXT)");

const snap = await fs.collection(COLLECTION).get();
console.log(`Firestore から ${snap.size} 件のキーを読み込みました。`);

let migrated = 0;
let skipped = 0;
for (const doc of snap.docs) {
  // blob 層のキーは doc.id（"/" は "__" に置換されているが、現行キーに "/" は無い）。
  const key = doc.id.replace(/__/g, "/");
  const raw = doc.data()?.raw;
  if (typeof raw !== "string") {
    console.log(`skip ${key}: raw が文字列でない`);
    skipped += 1;
    continue;
  }
  if (!force) {
    const existing = await turso.execute({ sql: "SELECT raw FROM kv WHERE key = ?", args: [key] });
    if (existing.rows.length && existing.rows[0].raw && existing.rows[0].raw !== "[]") {
      console.log(`skip ${key}: Turso に既に中身あり（--force で上書き）`);
      skipped += 1;
      continue;
    }
  }
  await turso.execute({
    sql: "INSERT INTO kv (key, raw, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET raw = excluded.raw, updated_at = excluded.updated_at",
    args: [key, raw, new Date().toISOString()],
  });
  let count = "";
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) count = `（${v.length}件）`;
    else if (v && Array.isArray(v.goals)) count = `（goals ${v.goals.length}件）`;
  } catch {}
  console.log(`✓ ${key} を Turso へ移行${count}`);
  migrated += 1;
}

console.log(`完了。移行 ${migrated} / スキップ ${skipped}。`);
process.exit(0);

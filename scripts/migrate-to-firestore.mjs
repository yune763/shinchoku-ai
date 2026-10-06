#!/usr/bin/env node
// ローカルの data/*.json を Firestore（blob層と同じ形式）へ移行する一度きりのスクリプト。
//   使い方: node scripts/migrate-to-firestore.mjs [--force] [ファイル名...]
// 既定の対象: proposals.json / collection.json / sns-collection.json / tools.json
//   ※ store.json / settings.json は本番の「正」なので既定では対象外（事故防止）。
// --force を付けない限り、Firestore側に既に中身がある場合は上書きしない。
import { readFileSync } from "node:fs";
import path from "node:path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "");
if (!sa.project_id) {
  console.error("FIREBASE_SERVICE_ACCOUNT が未設定です（.env を読み込んで実行してください）。");
  process.exit(1);
}
if (!getApps().length) {
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
}
const db = getFirestore();
const COLLECTION = process.env.FIRESTORE_COLLECTION || "shinchoku";

const args = process.argv.slice(2);
const force = args.includes("--force");
const names = args.filter((a) => !a.startsWith("--"));
const targets = names.length
  ? names
  : ["proposals.json", "collection.json", "sns-collection.json", "tools.json"];

for (const name of targets) {
  const local = path.join(process.cwd(), "data", name);
  let raw;
  try {
    raw = readFileSync(local, "utf8");
  } catch {
    console.log(`skip ${name}: ローカルに無い`);
    continue;
  }
  const docRef = db.collection(COLLECTION).doc(name.replace(/\//g, "__"));
  if (!force) {
    const snap = await docRef.get();
    if (snap.exists && snap.data()?.raw && snap.data().raw !== "[]") {
      console.log(`skip ${name}: Firestoreに既に中身あり（--force で上書き）`);
      continue;
    }
  }
  await docRef.set({ raw, updatedAt: new Date().toISOString() });
  let count = "";
  try {
    const arr = JSON.parse(raw);
    count = Array.isArray(arr) ? `（${arr.length}件）` : "";
  } catch {}
  console.log(`✓ ${name} を Firestore へ移行${count}`);
}
console.log("完了。");

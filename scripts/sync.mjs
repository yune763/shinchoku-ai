// 中継（GitHub raw / Drive公開 等）に置かれた proposals.json / collection.json を
// 取得して、進捗管理AI のローカル取り込みAPIへ投入する。
// Windows タスクスケジューラで平日10:20・15:20 に実行する想定。
//
// 設定は scripts/sync.config.json（無ければ環境変数）で与える:
// {
//   "base": "http://localhost:3000",
//   "proposalsUrl": "https://raw.githubusercontent.com/<user>/<repo>/main/proposals.json",
//   "collectionUrl": "https://raw.githubusercontent.com/<user>/<repo>/main/collection.json"
// }
//
// 実行: node scripts/sync.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(await readFile(path.join(here, "sync.config.json"), "utf8"));
  } catch {
    // 設定ファイルが無ければ環境変数を使う
  }
  return {
    base: process.env.PROGRESS_BASE || cfg.base || "http://localhost:3000",
    proposalsUrl: process.env.PROPOSALS_URL || cfg.proposalsUrl || "",
    collectionUrl: process.env.COLLECTION_URL || cfg.collectionUrl || "",
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`取得失敗 ${res.status}: ${url}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`投入失敗 ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const { base, proposalsUrl, collectionUrl } = await loadConfig();
  const stamp = new Date().toISOString();
  console.log(`[sync] ${stamp} base=${base}`);

  if (proposalsUrl) {
    try {
      const proposals = await fetchJson(proposalsUrl);
      const r = await postJson(`${base}/api/proposals/ingest`, proposals);
      console.log(`[sync] 開発提案: 追加${r.added} / 更新${r.updated} / 合計${r.total}`);
    } catch (e) {
      console.error(`[sync] 開発提案の同期に失敗: ${e.message}`);
    }
  } else {
    console.log("[sync] proposalsUrl 未設定のためスキップ");
  }

  if (collectionUrl) {
    try {
      const collection = await fetchJson(collectionUrl);
      const r = await postJson(`${base}/api/collection/ingest`, collection);
      console.log(`[sync] 情報収集: 追加${r.added} / 更新${r.updated} / 合計${r.total}`);
    } catch (e) {
      console.error(`[sync] 情報収集の同期に失敗: ${e.message}`);
    }
  } else {
    console.log("[sync] collectionUrl 未設定のためスキップ");
  }
}

main().catch((e) => {
  console.error("[sync] 想定外のエラー:", e);
  process.exit(1);
});

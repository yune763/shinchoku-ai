#!/usr/bin/env node
// Render無料プランのスリープ回避。平日の9:00〜21:59(JST)のみ、本番URLへ軽くGETして起こし続ける。
// 土日・日本の祝日はスキップ。タスクスケジューラから数分おきに呼ばれる想定。
// 自分自身で時間帯/曜日/祝日を判定するので、タスク側のトリガーは「平日の毎日・10分間隔」でよい。
import process from "node:process";

const URL =
  (process.env.KEEPALIVE_URL || "https://shinchoku-ai.onrender.com").replace(/\/$/, "") +
  "/api/health";

// 稼働時間帯（JST, 24h表記）。START以上 END未満。
const START_HOUR = 9;
const END_HOUR = 22; // 22時台はping対象外（21:59まで）

// 日本の祝日（run_scheduled.py と揃える。年が変わったら追記）。
const JP_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20",
  "2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06",
  "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23",
  "2026-10-12", "2026-11-03", "2026-11-23",
  "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21",
  "2027-03-22", "2027-04-29", "2027-05-03", "2027-05-04", "2027-05-05",
  "2027-07-19", "2027-08-11", "2027-09-20", "2027-09-23", "2027-10-11",
  "2027-11-03", "2027-11-23",
]);

function nowJst() {
  // 実行環境のTZに依存せずJSTを得る。
  const utc = Date.now();
  return new Date(utc + 9 * 60 * 60 * 1000);
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const d = nowJst();
  const day = d.getUTCDay(); // JST補正済みのDateに対しUTC曜日=JST曜日
  const hour = d.getUTCHours();
  const dateStr = ymd(d);

  if (day === 0 || day === 6) {
    console.log(`skip: 週末 (${dateStr})`);
    return;
  }
  if (JP_HOLIDAYS.has(dateStr)) {
    console.log(`skip: 祝日 (${dateStr})`);
    return;
  }
  if (hour < START_HOUR || hour >= END_HOUR) {
    console.log(`skip: 時間外 ${hour}時 (対象 ${START_HOUR}-${END_HOUR}時)`);
    return;
  }

  const t0 = Date.now();
  try {
    const res = await fetch(URL, { cache: "no-store" });
    console.log(`ping ${URL} -> ${res.status} (${Date.now() - t0}ms) @${dateStr} ${hour}時`);
  } catch (e) {
    console.log(`ping失敗: ${e.message}`);
  }
}

main();

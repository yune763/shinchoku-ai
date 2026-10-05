// エージェント/情報収集/data/reports/*.json を読み、進捗管理AIの data/collection.json を
// 再構築する。サーバ起動に依存しないファイル方式（Next.js は collection.json を都度読む）。
//
// 実行: node scripts/build-collection.mjs
// 定期収集(run_scheduled.py)から収集後に呼ばれ、情報収集ページを自動最新化する。

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..");
const REPORTS_DIR = path.resolve(
  APP_ROOT,
  "..",
  "エージェント",
  "情報収集",
  "data",
  "reports",
);
const OUT = path.join(APP_ROOT, "data", "collection.json");

const SEC_PICKS = "🔥 今日特に見るべき情報";
const SEC_UNCONFIRMED = "⚠️ 未確認情報(公式な裏付けなし)";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function jpTitle(date) {
  const d = new Date(`${date}T00:00:00+09:00`);
  const w = Number.isNaN(d.getTime()) ? "" : `(${WEEKDAYS[d.getDay()]})`;
  return `AI最新情報レポート ${date}${w}`;
}

function toSources(sources) {
  return (sources ?? []).map((s) => ({
    label: s.source_name ?? s.label ?? "",
    title: s.title ?? "",
    url: s.url ?? "",
  }));
}

function toTopic(t, section) {
  const isFollowup = t.relation === "followup" || t.relation === "update";
  const reason =
    (Array.isArray(t.pick_reasons) && t.pick_reasons[0]) ||
    (t.has_official ? "公式発表" : "");
  return {
    section,
    title: `${isFollowup ? "【続報】" : ""}${t.title ?? ""}`,
    stars: Number(t.importance ?? 0),
    reason,
    summary: t.summary ?? "",
    sources: toSources(t.sources),
    _id: t.id ?? "",
  };
}

function buildReport(r) {
  const date = r.run_date ?? r.date ?? "";
  const topics = [];
  const seen = new Set();
  const push = (t, section) => {
    const topic = toTopic(t, section);
    if (topic._id && seen.has(topic._id)) return; // pick と section の重複を排除
    if (topic._id) seen.add(topic._id);
    const { _id, ...clean } = topic;
    topics.push(clean);
  };

  for (const t of r.top_picks ?? []) push(t, SEC_PICKS);
  for (const sec of r.sections ?? []) {
    const label = sec.title ?? sec.key ?? "その他";
    for (const t of sec.topics ?? []) push(t, label);
  }
  for (const t of r.unconfirmed ?? []) push(t, SEC_UNCONFIRMED);

  const st = r.stats ?? {};
  const collected = st.collected ?? st?.collect?.new_items ?? topics.length;
  const relevant = st?.prefilter?.kept ?? st.relevant ?? collected;
  const summary = `収集 ${collected}件 → AI関連 ${relevant}件 → **${topics.length}トピック**`;

  return { date, title: jpTitle(date), summary, topicCount: topics.length, topics };
}

async function main() {
  let files;
  try {
    files = (await readdir(REPORTS_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  } catch (e) {
    console.error(`[build-collection] reports dir 読めず: ${REPORTS_DIR} (${e.message})`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("[build-collection] レポートJSONが0件。中断。");
    process.exit(1);
  }

  const reports = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(REPORTS_DIR, f), "utf8"));
      reports.push(buildReport(raw));
    } catch (e) {
      console.error(`[build-collection] ${f} の変換失敗: ${e.message}`);
    }
  }

  reports.sort((a, b) => String(b.date).localeCompare(String(a.date))); // 新しい順
  await writeFile(OUT, JSON.stringify(reports, null, 2), "utf8");
  console.log(
    `[build-collection] ${reports.length}日分を書き出し: ` +
      reports.map((r) => `${r.date}(${r.topicCount})`).join(", "),
  );
}

main().catch((e) => {
  console.error("[build-collection] 想定外のエラー:", e);
  process.exit(1);
});

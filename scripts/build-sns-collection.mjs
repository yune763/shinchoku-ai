// エージェント/SNS情報収集/data/reports/*.json を読み、進捗管理AIの
// data/sns-collection.json を再構築する。build-collection.mjs のSNS版。
// 実行: node scripts/build-sns-collection.mjs

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..");
const REPORTS_DIR = path.resolve(
  APP_ROOT,
  "..",
  "エージェント",
  "SNS情報収集",
  "data",
  "reports",
);
const OUT = path.join(APP_ROOT, "data", "sns-collection.json");

const SEC_PICKS = "🔥 今日のSNS注目トピック";
const SEC_UNCONFIRMED = "⚠️ 未確認情報(公式な裏付けなし)";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function jpTitle(date) {
  const d = new Date(`${date}T00:00:00+09:00`);
  const w = Number.isNaN(d.getTime()) ? "" : `(${WEEKDAYS[d.getDay()]})`;
  return `SNS情報収集レポート ${date}${w}`;
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
    (t.has_official ? "公式アカウント" : "");
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
    if (topic._id && seen.has(topic._id)) return;
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
  const summary = `収集 ${collected}件 → 関連 ${relevant}件 → **${topics.length}トピック**`;

  return { date, title: jpTitle(date), summary, topicCount: topics.length, topics };
}

async function main() {
  let files;
  try {
    files = (await readdir(REPORTS_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  } catch (e) {
    console.error(`[build-sns-collection] reports dir 読めず: ${REPORTS_DIR} (${e.message})`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("[build-sns-collection] SNSレポートJSONが0件。中断。");
    process.exit(1);
  }

  const reports = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(REPORTS_DIR, f), "utf8"));
      reports.push(buildReport(raw));
    } catch (e) {
      console.error(`[build-sns-collection] ${f} の変換失敗: ${e.message}`);
    }
  }

  reports.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  await writeFile(OUT, JSON.stringify(reports, null, 2), "utf8");
  console.log(
    `[build-sns-collection] ${reports.length}日分を書き出し: ` +
      reports.map((r) => `${r.date}(${r.topicCount})`).join(", "),
  );
}

main().catch((e) => {
  console.error("[build-sns-collection] 想定外のエラー:", e);
  process.exit(1);
});

// エージェント/開発提案(aidea)の最新レポート(data/proposals/YYYY-MM-DD.json)を読み、
// 進捗管理AIの data/proposals.json へ変換・マージする（既存は id で更新/追加）。
// build-collection.mjs のproposals版。実行: node scripts/build-proposals.mjs

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..");
const AIDEA_DIR = path.resolve(
  APP_ROOT, "..", "エージェント", "開発提案", "data", "proposals",
);
const OUT = path.join(APP_ROOT, "data", "proposals.json");

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

// aidea の 1フィールド → section.body 要素の配列に変換。
function toBody(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    const strs = value.filter((v) => typeof v === "string" && v.trim());
    if (strs.length) return [{ list: strs }];
    // オブジェクト配列などは文字列化して1段落に
    const rest = value.filter((v) => v && typeof v === "object")
      .map((v) => JSON.stringify(v));
    return rest.length ? [rest.join(" / ")] : [];
  }
  return [];
}

function section(h, value) {
  const body = toBody(value);
  return body.length ? { h, body } : null;
}

// aidea proposal → アプリ proposal スキーマ。
function mapProposal(p) {
  const date = p.run_date || "";
  const sections = [
    section("概要", p.overview),
    section("解決したい課題", p.problem),
    section("想定ユーザー", p.target_user),
    section("利用シーン", p.usage_scenario),
    section("AIの役割", p.ai_roles),
    section("主な機能", p.features),
    section("技術スタック", p.tech_stack),
    section("既存サービス", p.existing_services),
    section("差別化ポイント", p.differentiation),
    section("MVP（最小構成）", p.mvp),
    section("今後の展望", p.future),
    section("リスク・注意点", p.risks),
    section("なぜ今か", p.why_now),
    section("アップデート内容", p.update_summary),
    section("強化ポイント", p.upgrade_points),
  ].filter(Boolean);

  const srcTitles = Array.isArray(p.source_titles) ? p.source_titles : [];
  const source = srcTitles.length
    ? `情報収集・SNS情報収集レポート ${date}（${srcTitles.slice(0, 5).join("／")}）`
    : `情報収集・SNS情報収集レポート ${date}`;

  return {
    id: `aidea-${p.key}`,
    date,
    kind: p.relation === "update" ? "improve" : "new",
    title: p.title || "(無題)",
    sub: p.one_liner || "",
    source,
    sections,
  };
}

async function newestAideaFile() {
  const files = (await readdir(AIDEA_DIR)).filter((f) => DATE_RE.test(f));
  if (!files.length) return null;
  files.sort((a, b) => b.localeCompare(a));
  return path.join(AIDEA_DIR, files[0]);
}

async function main() {
  const latest = await newestAideaFile();
  if (!latest) {
    console.error(`[build-proposals] aideaレポートが0件: ${AIDEA_DIR}`);
    process.exit(1);
  }
  const raw = JSON.parse(await readFile(latest, "utf8"));
  const aideaProposals = [...(raw.new_proposals || []), ...(raw.update_proposals || [])]
    .map(mapProposal)
    .filter((p) => p.id && p.date);

  // 既存(クラウド由来など)を読み、id でマージ（aideaが新規/更新を上書き）。
  let existing = [];
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  const byId = new Map(existing.map((p) => [p.id, p]));
  let added = 0, updated = 0;
  for (const p of aideaProposals) {
    if (byId.has(p.id)) updated += 1; else added += 1;
    byId.set(p.id, p);
  }

  const merged = [...byId.values()].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")));
  await writeFile(OUT, JSON.stringify(merged, null, 2), "utf8");
  console.log(
    `[build-proposals] ${path.basename(latest)} から aidea提案 ${aideaProposals.length}件 ` +
      `(追加${added}/更新${updated}) → 合計${merged.length}件`,
  );
}

main().catch((e) => {
  console.error("[build-proposals] 想定外のエラー:", e);
  process.exit(1);
});

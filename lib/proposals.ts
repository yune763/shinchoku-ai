import { readJson } from "./blob";

// 開発提案（情報収集→開発提案システムが生成した提案）を読み込む。
// データは blob 層（ローカル=ファイル/クラウド=Redis）に保存。

export const PROPOSAL_KIND_LABEL: Record<string, string> = {
  improve: "既存業務の改善",
  new: "新しいシステム",
  ai: "AI・ツール活用",
  other: "その他",
};

// section.body の要素はいくつかの形を取る（段落/強調/箇条書き/手順/数値）。
export type ProposalBodyItem =
  | string
  | { callout: string }
  | { list: string[] }
  | { steps: string[] }
  | { metrics: { n: string; l: string }[] };

export interface ProposalSection {
  h: string;
  body: ProposalBodyItem[];
}

export interface Proposal {
  id: string;
  date: string;
  kind: string;
  title: string;
  sub?: string;
  source?: string;
  sections: ProposalSection[];
}

const PROPOSALS_KEY = "proposals.json";

export async function listProposals(): Promise<Proposal[]> {
  const arr = await readJson<Proposal[]>(PROPOSALS_KEY, []);
  if (!Array.isArray(arr)) return [];
  // 新しい日付が先頭になるよう並べる（同日は元の順序を保持）。
  return [...arr].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const all = await listProposals();
  return all.find((p) => p.id === id) ?? null;
}

// ゴール（提案）に向かうための「過程タスク」を提案内容から導出する。
// 提案に手順/ステップ/導入フェーズがあればそれを使い、無ければ標準の開発工程を返す。
const PROCESS_HEADING = /(進め方|手順|ステップ|導入|フェーズ|ロードマップ|計画|実装|工程)/;
const DEFAULT_PROCESS_TASKS = [
  "要件定義・整理",
  "設計・段取りを決める",
  "実装・制作を進める",
  "テスト・動作確認",
  "リリース・展開",
];

export function deriveProcessTasks(p: Proposal): string[] {
  const found: string[] = [];
  for (const sec of p.sections ?? []) {
    for (const item of sec.body ?? []) {
      if (typeof item === "object" && "steps" in item) {
        found.push(...item.steps);
      } else if (
        typeof item === "object" &&
        "list" in item &&
        PROCESS_HEADING.test(sec.h)
      ) {
        found.push(...item.list);
      }
    }
  }
  // 整形（トリム・短縮・重複排除・空除去）。最大8件に制限。
  const seen = new Set<string>();
  const tasks: string[] = [];
  for (const raw of found) {
    const t = raw.replace(/\s+/g, " ").trim().slice(0, 60);
    if (t && !seen.has(t)) {
      seen.add(t);
      tasks.push(t);
    }
  }
  return (tasks.length > 0 ? tasks : DEFAULT_PROCESS_TASKS).slice(0, 8);
}

// 提案を1つのプレーンテキスト（Markdown風）に変換。ゴールのログ本文に連携する。
export function proposalToText(p: Proposal): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  if (p.sub) lines.push("", p.sub);
  lines.push("");
  for (const sec of p.sections ?? []) {
    lines.push(`## ${sec.h}`);
    for (const item of sec.body ?? []) {
      if (typeof item === "string") lines.push(item);
      else if ("callout" in item) lines.push(`> ${item.callout}`);
      else if ("list" in item)
        item.list.forEach((x) => lines.push(`- ${x}`));
      else if ("steps" in item)
        item.steps.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
      else if ("metrics" in item)
        item.metrics.forEach((m) => lines.push(`- ${m.n} … ${m.l}`));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

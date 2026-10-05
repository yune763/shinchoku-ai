import { z } from "zod";
import type { Proposal } from "./proposals";
import { readJson, writeJson } from "./blob";

// 開発提案の「正」データ（進捗管理AIが保持）。生成元（ローカル/クラウド）が
// このAPI経由で書き込む。blob 層（ローカル=ファイル/クラウド=Redis）が保存先。
const PROPOSALS_KEY = "proposals.json";

// section.body の要素（段落/強調/箇条書き/手順/数値）。緩めに検証する。
const bodyItemSchema = z.union([
  z.string(),
  z.object({ callout: z.string() }),
  z.object({ list: z.array(z.string()) }),
  z.object({ steps: z.array(z.string()) }),
  z.object({ metrics: z.array(z.object({ n: z.string(), l: z.string() })) }),
]);

export const proposalSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  kind: z.enum(["improve", "new", "ai", "other"]).default("other"),
  title: z.string().min(1),
  sub: z.string().optional().default(""),
  source: z.string().optional().default(""),
  sections: z
    .array(z.object({ h: z.string(), body: z.array(bodyItemSchema).default([]) }))
    .default([]),
});

// 1件でも配列でも受け付ける。
export const ingestSchema = z.union([proposalSchema, z.array(proposalSchema)]);

async function readAll(): Promise<Proposal[]> {
  const arr = await readJson<Proposal[]>(PROPOSALS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

async function writeAll(list: Proposal[]): Promise<void> {
  await writeJson(PROPOSALS_KEY, list);
}

export interface IngestResult {
  added: number;
  updated: number;
  total: number;
  addedIds: string[];
}

// 取り込み：id が既存なら更新、無ければ追加。日付降順で保存（新しいものが先頭）。
export async function ingestProposals(
  incoming: Proposal[],
): Promise<IngestResult> {
  const current = await readAll();
  const byId = new Map(current.map((p) => [p.id, p]));
  const addedIds: string[] = [];
  let updated = 0;
  for (const p of incoming) {
    if (byId.has(p.id)) updated += 1;
    else addedIds.push(p.id);
    byId.set(p.id, p);
  }
  const merged = [...byId.values()].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  await writeAll(merged);
  return {
    added: addedIds.length,
    updated,
    total: merged.length,
    addedIds,
  };
}

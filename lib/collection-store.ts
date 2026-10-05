import { z } from "zod";
import type { CollectionReport } from "./collection";
import { readJson, writeJson } from "./blob";

// 情報収集レポートの取り込み先（進捗管理AIが保持する「正」）。
const COLLECTION_KEY = "collection.json";

const sourceSchema = z.object({
  label: z.string().default(""),
  title: z.string().default(""),
  url: z.string().default(""),
});

const topicSchema = z.object({
  section: z.string().default(""),
  title: z.string().min(1),
  stars: z.number().default(0),
  reason: z.string().default(""),
  summary: z.string().default(""),
  sources: z.array(sourceSchema).default([]),
});

export const reportSchema = z.object({
  date: z.string().min(1),
  title: z.string().default(""),
  summary: z.string().default(""),
  topicCount: z.number().default(0),
  topics: z.array(topicSchema).default([]),
});

export const collectionIngestSchema = z.union([
  reportSchema,
  z.array(reportSchema),
]);

async function readAll(): Promise<CollectionReport[]> {
  const arr = await readJson<CollectionReport[]>(COLLECTION_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

// 取り込み：同じ date は差し替え、無ければ追加。日付降順で保存。
export async function ingestReports(
  incoming: CollectionReport[],
): Promise<{ added: number; updated: number; total: number }> {
  const current = await readAll();
  const byDate = new Map(current.map((r) => [r.date, r]));
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    if (byDate.has(r.date)) updated += 1;
    else added += 1;
    byDate.set(r.date, { ...r, topicCount: r.topics.length });
  }
  const merged = [...byDate.values()].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  await writeJson(COLLECTION_KEY, merged);
  return { added, updated, total: merged.length };
}

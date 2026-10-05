import type { CollectionReport, CollectionReportMeta } from "./collection-shared";
import { readJson } from "./blob";

// 型・分類ロジックは collection-shared（fsなし）に集約。ここではデータ読み取りを担う。
export * from "./collection-shared";

const COLLECTION_KEY = "collection.json";

async function readAll(): Promise<CollectionReport[]> {
  const arr = await readJson<CollectionReport[]>(COLLECTION_KEY, []);
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
}

// 一覧用（本文トピックは除いた軽い形）。
export async function listReports(): Promise<CollectionReportMeta[]> {
  const all = await readAll();
  return all.map(({ topics, ...meta }) => meta);
}

export async function getReport(
  date: string,
): Promise<CollectionReport | null> {
  const all = await readAll();
  return all.find((r) => r.date === date) ?? null;
}

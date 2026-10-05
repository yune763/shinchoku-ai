import type { CollectionReport, CollectionReportMeta } from "./collection-shared";
import { readJson } from "./blob";

// SNS情報収集の読み取り層。型・分類ロジックは collection-shared を共用し、
// 読み込むキーだけ sns-collection.json に差し替える。
export * from "./collection-shared";

const SNS_COLLECTION_KEY = "sns-collection.json";

async function readAll(): Promise<CollectionReport[]> {
  const arr = await readJson<CollectionReport[]>(SNS_COLLECTION_KEY, []);
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

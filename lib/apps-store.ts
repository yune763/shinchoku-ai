import { randomUUID } from "node:crypto";
import { AppItem, AppInput } from "./apps-shared";
import { readJson, writeJson } from "./blob";

// 自主制作アプリの一覧データ。blob 層（ローカル=ファイル/クラウド=Turso等）に保存する。
// 型・スキーマは ./apps-shared に分離（クライアントからも利用可）。
export * from "./apps-shared";

const APPS_KEY = "apps.json";

async function readAll(): Promise<AppItem[]> {
  const arr = await readJson<AppItem[]>(APPS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

async function writeAll(list: AppItem[]): Promise<void> {
  await writeJson(APPS_KEY, list);
}

export async function listApps(): Promise<AppItem[]> {
  const all = await readAll();
  return all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function createApp(input: AppInput): Promise<AppItem> {
  const all = await readAll();
  const now = new Date().toISOString();
  const app: AppItem = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
  all.push(app);
  await writeAll(all);
  return app;
}

export async function updateApp(
  id: string,
  patch: Partial<AppInput>,
): Promise<AppItem | null> {
  const all = await readAll();
  const a = all.find((x) => x.id === id);
  if (!a) return null;
  Object.assign(a, patch);
  a.updatedAt = new Date().toISOString();
  await writeAll(all);
  return a;
}

export async function deleteApp(id: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}

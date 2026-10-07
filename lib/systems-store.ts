import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./blob";

// 社内で使っているシステムの一覧（システム名＋URL）。共有DBに保存。
const SYSTEMS_KEY = "systems.json";

export interface SystemItem {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

async function readAll(): Promise<SystemItem[]> {
  const arr = await readJson<SystemItem[]>(SYSTEMS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export async function listSystems(): Promise<SystemItem[]> {
  const all = await readAll();
  return all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function createSystem(
  name: string,
  url: string,
): Promise<SystemItem> {
  const clean = name.trim();
  if (!clean) throw new Error("システム名は必須です");
  const all = await readAll();
  const item: SystemItem = {
    id: randomUUID(),
    name: clean,
    url: url.trim(),
    createdAt: new Date().toISOString(),
  };
  all.push(item);
  await writeJson(SYSTEMS_KEY, all);
  return item;
}

export async function deleteSystem(id: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  await writeJson(SYSTEMS_KEY, next);
  return true;
}

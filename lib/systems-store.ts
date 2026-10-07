import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./blob";

// 社内で使っているシステムの一覧（システム名＋URL）。共有DBに保存。
const SYSTEMS_KEY = "systems.json";

export interface SystemItem {
  id: string;
  name: string;
  url: string;
  operationSteps: string; // 操作手順
  tools: string[]; // 使用ツール（増減あり）
  createdAt: string;
}

export interface SystemInput {
  name: string;
  url?: string;
  operationSteps?: string;
  tools?: string[];
}

async function readAll(): Promise<SystemItem[]> {
  const arr = await readJson<SystemItem[]>(SYSTEMS_KEY, []);
  if (!Array.isArray(arr)) return [];
  // 旧データ互換（新フィールド補完）。
  return arr.map((s) => ({
    ...s,
    operationSteps: s.operationSteps ?? "",
    tools: Array.isArray(s.tools) ? s.tools : [],
  }));
}

export async function listSystems(): Promise<SystemItem[]> {
  const all = await readAll();
  return all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function cleanTools(tools?: string[]): string[] {
  return (tools ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 50);
}

export async function createSystem(input: SystemInput): Promise<SystemItem> {
  const name = input.name.trim();
  if (!name) throw new Error("システム名は必須です");
  const all = await readAll();
  const item: SystemItem = {
    id: randomUUID(),
    name,
    url: (input.url ?? "").trim(),
    operationSteps: (input.operationSteps ?? "").trim(),
    tools: cleanTools(input.tools),
    createdAt: new Date().toISOString(),
  };
  all.push(item);
  await writeJson(SYSTEMS_KEY, all);
  return item;
}

export async function updateSystem(
  id: string,
  input: SystemInput,
): Promise<SystemItem | null> {
  const name = input.name.trim();
  if (!name) throw new Error("システム名は必須です");
  const all = await readAll();
  const s = all.find((x) => x.id === id);
  if (!s) return null;
  s.name = name;
  s.url = (input.url ?? "").trim();
  s.operationSteps = (input.operationSteps ?? "").trim();
  s.tools = cleanTools(input.tools);
  await writeJson(SYSTEMS_KEY, all);
  return s;
}

export async function deleteSystem(id: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  await writeJson(SYSTEMS_KEY, next);
  return true;
}

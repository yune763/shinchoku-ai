import { randomUUID } from "node:crypto";
import { Tool, ToolInput } from "./tools-shared";
import { readJson, writeJson } from "./blob";

// 課金ツール（サブスク等）の管理データ。blob 層（ローカル=ファイル/クラウド=Redis）に保存する。
// 注意: password は平文で保存される。機密性の高いものは専用のパスワードマネージャ推奨。
// 型・定数・純粋関数は ./tools-shared に分離（クライアントからも利用可）。
export * from "./tools-shared";

const TOOLS_KEY = "tools.json";

async function readAll(): Promise<Tool[]> {
  const arr = await readJson<Tool[]>(TOOLS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

async function writeAll(list: Tool[]): Promise<void> {
  await writeJson(TOOLS_KEY, list);
}

export async function listTools(): Promise<Tool[]> {
  const all = await readAll();
  return all.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function createTool(input: ToolInput): Promise<Tool> {
  const all = await readAll();
  const now = new Date().toISOString();
  const tool: Tool = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
  all.push(tool);
  await writeAll(all);
  return tool;
}

export async function updateTool(
  id: string,
  patch: Partial<ToolInput>,
): Promise<Tool | null> {
  const all = await readAll();
  const t = all.find((x) => x.id === id);
  if (!t) return null;
  Object.assign(t, patch);
  t.updatedAt = new Date().toISOString();
  await writeAll(all);
  return t;
}

export async function deleteTool(id: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}

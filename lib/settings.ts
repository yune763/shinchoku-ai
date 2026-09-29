import { promises as fs } from "node:fs";
import path from "node:path";

// アプリのローカル設定（作業中ゴールなど）。data/settings.json に保存。
const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "settings.json");

export interface Settings {
  activeGoalId: string | null; // いま作業中のゴール（コミット自動記録の宛先）
}

const DEFAULTS: Settings = { activeGoalId: null };

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setActiveGoal(id: string | null): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, activeGoalId: id };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

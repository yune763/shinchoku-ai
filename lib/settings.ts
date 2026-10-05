import { readJson, writeJson } from "./blob";

// アプリの設定（作業中ゴールなど）。blob 層（ローカル=ファイル/クラウド=Redis）に保存。
const SETTINGS_KEY = "settings.json";

export interface Settings {
  activeGoalId: string | null; // いま作業中のゴール（コミット自動記録の宛先）
  pendingRunGoalId: string | null; // 実装中で未完了のゴール（クラッシュ後に続きから再開する）
}

const DEFAULTS: Settings = { activeGoalId: null, pendingRunGoalId: null };

export async function getSettings(): Promise<Settings> {
  const data = await readJson<Partial<Settings>>(SETTINGS_KEY, {});
  return { ...DEFAULTS, ...data };
}

export async function setActiveGoal(id: string | null): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, activeGoalId: id };
  await writeJson(SETTINGS_KEY, next);
  return next;
}

// 実装中で未完了のゴール（クラッシュ後に続きから再開するためのマーカー）。
export async function setPendingRun(id: string | null): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, pendingRunGoalId: id };
  await writeJson(SETTINGS_KEY, next);
  return next;
}

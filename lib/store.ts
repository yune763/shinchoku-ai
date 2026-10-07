import { randomUUID } from "node:crypto";
import {
  Goal,
  GoalInput,
  GOAL_STATUS,
  LogEntry,
  LogInput,
  LOG_KIND,
  Step,
  StepInput,
  Review,
  ReviewInput,
} from "./types";
import { seedGoals } from "./seed";
import { exportSnapshot } from "./team";
import { readJson, writeJson, ensureJson } from "./blob";

// データは blob 層に保存（ローカル=ファイル / クラウド=Upstash Redis）。
const STORE_KEY = "store.json";

interface DbShape {
  goals: Goal[];
  migrations?: Record<string, boolean>; // 1回だけ実行する移行の実施フラグ
}

// 既存ゴールの担当者を一括設定する移行の対象者。
const ASSIGNEE_BOOTSTRAP = "祢次金 由貴";

async function read(): Promise<DbShape> {
  await ensureJson<DbShape>(STORE_KEY, () => ({ goals: seedGoals() }));
  const db = await readJson<DbShape>(STORE_KEY, { goals: seedGoals() });
  if (!Array.isArray(db.goals)) db.goals = [];
  if (!db.migrations) db.migrations = {};
  // 旧データとの後方互換（新フィールドを補完）。
  db.goals.forEach((g) => {
    if (g.steps === undefined) g.steps = [];
    if (g.review === undefined) g.review = null;
    if (g.desire === undefined) g.desire = "";
    if (g.repoPath === undefined) g.repoPath = "";
    if (g.previewCommand === undefined) g.previewCommand = "";
    if (g.previewUrl === undefined) g.previewUrl = "";
    if (g.estimatedHours === undefined) g.estimatedHours = 0;
    if (g.reviewer === undefined) g.reviewer = "";
    if (g.salesPerson === undefined) g.salesPerson = "";
  });

  // 一度だけ：既存の全ゴールの実装担当(assignee)を指定メンバーに揃える。
  if (!db.migrations.assigneeBootstrap) {
    db.goals.forEach((g) => {
      g.assignee = ASSIGNEE_BOOTSTRAP;
    });
    db.migrations.assigneeBootstrap = true;
    await writeJson(STORE_KEY, db);
  }

  return db;
}

async function write(db: DbShape): Promise<void> {
  await writeJson(STORE_KEY, db);
  // 書き込みのたびに自分の進捗を共有フォルダへ反映（設定時のみ）。
  await exportSnapshot(db.goals);
}

function now(): string {
  return new Date().toISOString();
}

export async function listGoals(): Promise<Goal[]> {
  const db = await read();
  return db.goals;
}

export async function getGoal(id: string): Promise<Goal | null> {
  const db = await read();
  return db.goals.find((g) => g.id === id) ?? null;
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const db = await read();
  const goal: Goal = {
    id: randomUUID(),
    parentId: input.parentId,
    title: input.title,
    desire: input.desire,
    purpose: input.purpose,
    currentStatus: input.currentStatus,
    completionCriteria: input.completionCriteria,
    status: input.status,
    assignee: input.assignee,
    reviewer: input.reviewer,
    salesPerson: input.salesPerson,
    dueDate: input.dueDate,
    kpi: input.kpi ?? "",
    forecast: input.forecast ?? "",
    repoPath: input.repoPath,
    previewCommand: input.previewCommand,
    previewUrl: input.previewUrl,
    estimatedHours: input.estimatedHours,
    progress: input.progress,
    steps: [],
    logs: [],
    review: null,
    createdAt: now(),
    updatedAt: now(),
  };
  db.goals.push(goal);
  await write(db);
  return goal;
}

export async function updateGoal(
  id: string,
  patch: Partial<GoalInput>,
): Promise<Goal | null> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === id);
  if (!goal) return null;

  const prevStatus = goal.status;
  Object.assign(goal, patch, { updatedAt: now() });

  if (patch.status && patch.status !== prevStatus) {
    goal.logs.push(
      buildLog({
        kind: LOG_KIND.statusChange,
        author: "システム",
        body: `状態を「${prevStatus}」→「${patch.status}」に変更`,
      }),
    );
  }
  if (patch.status === GOAL_STATUS.done && goal.steps.length === 0) {
    goal.progress = 100;
  }

  // 完了（他状態→done）になったら、作成〜完了のリードタイムをメモとして記録する。
  if (patch.status === GOAL_STATUS.done && prevStatus !== GOAL_STATUS.done) {
    const ms = Date.parse(goal.updatedAt) - Date.parse(goal.createdAt);
    goal.logs.push(
      buildLog({
        kind: LOG_KIND.comment,
        author: "システム",
        body: `リードタイム（作成〜完了）: ${formatDuration(ms)}（作成 ${goal.createdAt.slice(0, 10)} → 完了 ${goal.updatedAt.slice(0, 10)}）`,
      }),
    );
  }

  await write(db);
  return goal;
}

// ミリ秒を「X日Yh」「Zh」「W分」等の読みやすい表記にする。
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "不明";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr > 0 ? `${d}日${hr}時間` : `${d}日`;
}

export async function deleteGoal(id: string): Promise<boolean> {
  const db = await read();
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of db.goals) {
      if (g.parentId && toDelete.has(g.parentId) && !toDelete.has(g.id)) {
        toDelete.add(g.id);
        changed = true;
      }
    }
  }
  const before = db.goals.length;
  db.goals = db.goals.filter((g) => !toDelete.has(g.id));
  await write(db);
  return db.goals.length < before;
}

// 子ゴールの状況から祖先の状態を再計算する（子が進行中なら親も進行中、
// 子が全部完了したときだけ親を完了に）。直近の親→上位の順で伝播させる。
export async function syncAncestorStatus(goalId: string): Promise<void> {
  const db = await read();
  const chain = ancestorsOf(goalId, db.goals); // 上位 → 直近の親
  for (let i = chain.length - 1; i >= 0; i--) {
    const parent = db.goals.find((g) => g.id === chain[i].id);
    if (!parent) continue;
    const kids = db.goals.filter((g) => g.parentId === parent.id);
    if (kids.length === 0) continue;

    const allDone = kids.every((k) => k.status === GOAL_STATUS.done);
    const anyActive = kids.some((k) => k.status !== GOAL_STATUS.notStarted);
    const next = allDone
      ? GOAL_STATUS.done
      : anyActive
        ? GOAL_STATUS.inProgress
        : GOAL_STATUS.notStarted;

    if (parent.status !== next) {
      const prev = parent.status;
      parent.status = next;
      parent.updatedAt = now();
      parent.logs.push(
        buildLog({
          kind: LOG_KIND.statusChange,
          author: "システム",
          body: `子ゴールの状況から状態を「${prev}」→「${next}」に自動更新`,
        }),
      );
    }
  }
  await write(db);
}

function buildLog(input: LogInput): LogEntry {
  return {
    id: randomUUID(),
    kind: input.kind,
    author: input.author,
    body: input.body,
    createdAt: now(),
  };
}

export async function addLog(
  goalId: string,
  input: LogInput,
): Promise<LogEntry | null> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const entry = buildLog(input);
  goal.logs.push(entry);
  goal.updatedAt = now();
  await write(db);
  return entry;
}

// ── ステップ（ロードマップ）操作 ──

export async function addStep(
  goalId: string,
  input: StepInput,
): Promise<Step | null> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const step: Step = {
    id: randomUUID(),
    title: input.title,
    actor: input.actor,
    done: false,
    note: input.note,
    links: input.links,
    createdAt: now(),
    doneAt: null,
  };
  goal.steps.push(step);
  goal.updatedAt = now();
  syncProgressFromSteps(goal);
  await write(db);
  return step;
}

export async function replaceSteps(
  goalId: string,
  steps: Omit<Step, "id" | "createdAt" | "doneAt" | "done">[],
): Promise<Goal | null> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  goal.steps = steps.map((s) => ({
    id: randomUUID(),
    title: s.title,
    actor: s.actor,
    note: s.note,
    links: s.links ?? [],
    done: false,
    createdAt: now(),
    doneAt: null,
  }));
  goal.updatedAt = now();
  syncProgressFromSteps(goal);
  await write(db);
  return goal;
}

export async function updateStep(
  goalId: string,
  stepId: string,
  patch: Partial<Pick<Step, "title" | "actor" | "done" | "note" | "links">>,
): Promise<Step | null> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const step = goal.steps.find((s) => s.id === stepId);
  if (!step) return null;
  const wasDone = step.done;
  Object.assign(step, patch);
  if (patch.done !== undefined && patch.done !== wasDone) {
    step.doneAt = patch.done ? now() : null;
    goal.logs.push(
      buildLog({
        kind: LOG_KIND.stepDone,
        author: "システム",
        body: `${patch.done ? "完了" : "未完了に戻す"}: ${step.title}`,
      }),
    );
  }
  goal.updatedAt = now();
  syncProgressFromSteps(goal);
  await write(db);
  return step;
}

export async function deleteStep(
  goalId: string,
  stepId: string,
): Promise<boolean> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === goalId);
  if (!goal) return false;
  const before = goal.steps.length;
  goal.steps = goal.steps.filter((s) => s.id !== stepId);
  goal.updatedAt = now();
  syncProgressFromSteps(goal);
  await write(db);
  return goal.steps.length < before;
}

export async function saveReview(
  goalId: string,
  input: ReviewInput,
): Promise<Goal | null> {
  const db = await read();
  const goal = db.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const review: Review = { ...input, reviewedAt: now() };
  goal.review = review;
  goal.status = GOAL_STATUS.done;
  if (goal.steps.length === 0) goal.progress = 100;
  goal.updatedAt = now();
  goal.logs.push(
    buildLog({
      kind: LOG_KIND.comment,
      author: input.reviewer,
      body: `【完了レビュー】${input.summary}`,
    }),
  );
  await write(db);
  return goal;
}

// ステップがあれば done 比率で進捗を自動更新（手動progressより優先）。
function syncProgressFromSteps(goal: Goal): void {
  if (goal.steps.length === 0) return;
  const done = goal.steps.filter((s) => s.done).length;
  goal.progress = Math.round((done / goal.steps.length) * 100);
}

// いま着手すべきステップ（最初の未完了）。
export function currentStep(goal: Goal): Step | null {
  return goal.steps.find((s) => !s.done) ?? null;
}

// 実装にかかりそうな時間(h)を自動で概算する（人手の見積りは不要）。
// 親は子孫（葉）の合計、葉はステップ数と記述量（やりたいこと/目的/完了基準/現状）から概算。
const EST_BASE_H = 1; // 葉1件の基礎時間
const EST_PER_STEP_H = 0.5; // ロードマップ1ステップあたり
const EST_PER_CHARS = 200; // この文字数ごとに
const EST_PER_CHARS_H = 1; // 1時間加算
const EST_MAX_LEAF_H = 40; // 葉1件の上限
export function estimateHours(goalId: string, all: Goal[]): number {
  const children = all.filter((g) => g.parentId === goalId);
  if (children.length > 0) {
    const sum = children.reduce((acc, c) => acc + estimateHours(c.id, all), 0);
    return Math.round(sum * 2) / 2;
  }
  const self = all.find((g) => g.id === goalId);
  if (!self) return 0;
  const textLen =
    (self.desire?.length ?? 0) +
    (self.purpose?.length ?? 0) +
    (self.completionCriteria?.length ?? 0) +
    (self.currentStatus?.length ?? 0);
  const raw =
    EST_BASE_H +
    self.steps.length * EST_PER_STEP_H +
    Math.floor(textLen / EST_PER_CHARS) * EST_PER_CHARS_H;
  const clamped = Math.min(EST_MAX_LEAF_H, Math.max(0.5, raw));
  return Math.round(clamped * 2) / 2;
}

// 子ゴールから親の進捗を再帰的に算出（葉は自身のprogress）。
export function computeProgress(goalId: string, all: Goal[]): number {
  const children = all.filter((g) => g.parentId === goalId);
  if (children.length === 0) {
    const self = all.find((g) => g.id === goalId);
    return self ? self.progress : 0;
  }
  const sum = children.reduce((acc, c) => acc + computeProgress(c.id, all), 0);
  return Math.round(sum / children.length);
}

// 祖先チェーン（会社ゴールまで遡る）。AIプロンプトの「何のために」に使う。
export function ancestorsOf(goalId: string, all: Goal[]): Goal[] {
  const chain: Goal[] = [];
  let current = all.find((g) => g.id === goalId);
  while (current && current.parentId) {
    const parent = all.find((g) => g.id === current!.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function childrenOf(goalId: string | null, all: Goal[]): Goal[] {
  return all.filter((g) => g.parentId === goalId);
}

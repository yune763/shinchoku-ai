import { promises as fs } from "node:fs";
import path from "node:path";
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

// データはローカルJSONに保存（DBサーバ不要でそのまま動く）。
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

interface DbShape {
  goals: Goal[];
}

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const initial: DbShape = { goals: seedGoals() };
    await fs.writeFile(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function read(): Promise<DbShape> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const db = JSON.parse(raw) as DbShape;
  // 旧データとの後方互換（新フィールドを補完）。
  db.goals.forEach((g) => {
    if (g.steps === undefined) g.steps = [];
    if (g.review === undefined) g.review = null;
    if (g.desire === undefined) g.desire = "";
  });
  return db;
}

async function write(db: DbShape): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
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
    dueDate: input.dueDate,
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

  await write(db);
  return goal;
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

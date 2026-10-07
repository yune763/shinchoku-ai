import { createGoal, listGoals, childrenOf, addLog } from "./store";
import { GOAL_STATUS, type Goal } from "./types";
import type { StoredMessage } from "./chat-store";
import type { PublicUser } from "./accounts";

// チャット↔タスク（ゴール）の橋渡し。
// タスク = 末端ゴール（子を持たない未完了ゴール）。「今日のToDo」と同じ概念。

// JSTの今日(YYYY-MM-DD)。
export function todayStrJst(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// メッセージ本文を短いタスク名に整える。
function toTaskTitle(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 60 ? one.slice(0, 60) + "…" : one;
}

export type TaskTarget = "today" | "goal";

// メッセージからタスク（ゴール）を作る。
// target='today' … 独立したToDo（親なし・期日=今日）
// target='goal'  … 指定ゴールの子ToDo（期日=今日）
export async function createTaskFromMessage(
  msg: StoredMessage,
  user: PublicUser,
  target: TaskTarget,
  goalId?: string,
  opts?: { auto?: boolean },
): Promise<Goal> {
  const auto = !!opts?.auto;
  const goal = await createGoal({
    parentId: target === "goal" && goalId ? goalId : null,
    title: toTaskTitle(msg.text),
    desire: "",
    purpose: "",
    currentStatus: "",
    completionCriteria: "",
    status: GOAL_STATUS.notStarted,
    // 手動タスク化＝押した人が担当。自動＝未割当（誰でも拾える）。
    assignee: auto ? "" : user.displayName,
    reviewer: "",
    salesPerson: "",
    dueDate: todayStrJst(),
    kpi: "",
    forecast: "",
    repoPath: "",
    previewCommand: "",
    previewUrl: "",
    estimatedHours: 0,
    progress: 0,
    // 「今日のToDoに追加」はToDo専用（ゴール一覧・メンバー進捗には出さない）。
    todoOnly: target === "today",
  });
  // 出所をログに残す（どのチャットから来たか）。
  await addLog(goal.id, {
    body:
      (auto ? "チャットから自動追加(学習)：" : "チャットから追加：") +
      `「${toTaskTitle(msg.text)}」（${msg.senderName}）`,
    kind: "comment",
    author: auto ? "自動タスク化" : user.displayName,
  });
  return goal;
}

export interface TaskItem {
  id: string;
  title: string;
  assignee: string;
  dueDate: string | null;
  status: Goal["status"];
}

// 末端の未完了ゴールを「今日 / 明日以降」に振り分ける。
// 今日 = 期日が今日以前 or 未設定。明日以降 = 期日が明日以降。
export async function listTasksSplit(): Promise<{
  today: TaskItem[];
  upcoming: TaskItem[];
}> {
  const goals = await listGoals();
  const leaves = goals.filter(
    (g) => childrenOf(g.id, goals).length === 0 && g.status !== GOAL_STATUS.done,
  );
  const t = todayStrJst();
  const today: TaskItem[] = [];
  const upcoming: TaskItem[] = [];
  for (const g of leaves) {
    const item: TaskItem = {
      id: g.id,
      title: g.title,
      assignee: g.assignee,
      dueDate: g.dueDate,
      status: g.status,
    };
    if (g.dueDate && g.dueDate > t) upcoming.push(item);
    else today.push(item);
  }
  const byDue = (a: TaskItem, b: TaskItem) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  today.sort(byDue);
  upcoming.sort(byDue);
  return { today, upcoming };
}

// 既存ゴール（タスク追加先の候補）：末端でなくてもよいが、完了は除く。
export async function listGoalTargets(): Promise<
  { id: string; title: string }[]
> {
  const goals = await listGoals();
  return goals
    .filter((g) => g.status !== GOAL_STATUS.done)
    .map((g) => ({ id: g.id, title: g.title }));
}

import {
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  addLog,
  updateStep,
  computeProgress,
} from "./store";
import { ensureBreakdown } from "./breakdown";
import { startRun, overlayLiveProgress, anyRunning } from "./claude-runner";
import { runClaudeText } from "./claude-text";
import { GOAL_STATUS, GOAL_STATUS_LABEL, GoalStatus, LOG_KIND } from "./types";

// アプリ内AIアシスタント。claude CLI(Max定額)で、進捗の確認＋簡単な修正まで行う。

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ChatResult {
  reply: string;
  actions: string[]; // 実行した操作の要約（ユーザー表示用）
}

const ACTIONS_MARK = "@@ACTIONS@@";

// 状態の日本語→enum 変換（AIが日本語で返しても拾えるように）。
const STATUS_ALIASES: Record<string, GoalStatus> = {
  not_started: "not_started",
  未着手: "not_started",
  in_progress: "in_progress",
  進行中: "in_progress",
  blocked: "blocked",
  停滞: "blocked",
  done: "done",
  完了: "done",
};

export async function chat(
  message: string,
  history: ChatMessage[],
  focusGoalId?: string,
): Promise<ChatResult> {
  // 画面と同じ進捗を見せる：実行中のライブ進捗を重ねる（表示値の食い違いを防ぐ）。
  const goals = overlayLiveProgress(await listGoals());
  const prompt = buildPrompt(message, history, goals, focusGoalId);
  const raw = await runClaudeText(prompt);
  const { reply, actions } = splitActions(raw);
  const summaries = await executeActions(actions);
  return { reply: reply || "(応答が空でした)", actions: summaries };
}

function buildPrompt(
  message: string,
  history: ChatMessage[],
  goals: Awaited<ReturnType<typeof listGoals>>,
  focusGoalId?: string,
): string {
  const lines: string[] = [];
  lines.push(
    "あなたは進捗管理AIアプリの中に住むアシスタントです。以下のゴールデータを前提に、ユーザーの質問へ日本語で簡潔に答えてください。",
  );

  // 特定タスクを主題にした会話（吹き出しから開始）なら、それを最優先の文脈にする。
  const focus = focusGoalId ? goals.find((g) => g.id === focusGoalId) : null;
  if (focus) {
    lines.push("");
    lines.push(
      `## この会話の主題タスク（ユーザーの「このタスク」「これ」等はこのゴールを指す）`,
    );
    lines.push(`- id: ${focus.id}`);
    lines.push(`- タイトル: ${focus.title}`);
    lines.push(
      `- 状態: ${GOAL_STATUS_LABEL[focus.status]} / 進捗 ${computeProgress(focus.id, goals)}%（子ゴールから自動算出。実行中は推定ライブ値を含む）`,
    );
    if (focus.purpose) lines.push(`- 目的: ${focus.purpose}`);
    if (focus.currentStatus) lines.push(`- 現状: ${focus.currentStatus}`);
    if (focus.completionCriteria)
      lines.push(`- 完了の基準: ${focus.completionCriteria}`);
    if (focus.steps.length > 0) {
      lines.push("- ロードマップ:");
      focus.steps.forEach((s) =>
        lines.push(`  ${s.done ? "[x]" : "[ ]"} ${s.title}`),
      );
    }
    const recent = [...focus.logs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
    if (recent.length > 0) {
      lines.push("- 最近の記録:");
      recent.forEach((l) =>
        lines.push(`  ・${l.createdAt.slice(0, 10)} ${l.author}: ${l.body.slice(0, 80)}`),
      );
    }
    lines.push("");
    lines.push(
      "【最重要】この会話には上の主題タスクが設定されている。ユーザーの発言は特に断りがない限り、この主題タスクについてのものとして扱うこと。『どのタスクですか？』と聞き返さない（主題タスクの id を使えばよい）。",
    );
    lines.push(
      "デザイン・レイアウト・UI・実装方針などの依頼は、主題タスクの実装への指示とみなす。あなたは画面を直接描き替えられないが、『できません』で終わらせず次のように応じること: (1) その方針を add_log と update_goal（currentStatus / completionCriteria に反映）でタスクに記録し、(2) ユーザーが実装・反映・やり直しを望むなら run_implement でそのタスクのClaude Code実装を起動する。実装時の既定でビジネス用途の程よいデザイン方針が適用される。",
    );
  }

  lines.push(
    "状態変更・修正・実装開始などデータを変えてほしい依頼のときだけ、回答の最後に次の形式でアクションを出力します（不要なら一切出力しない）:",
  );
  lines.push(ACTIONS_MARK);
  lines.push(
    '[{"type":"update_goal","goalId":"<id>","patch":{"status":"in_progress"}}]',
  );
  lines.push("");
  lines.push("利用できるアクション:");
  lines.push(
    '- update_goal: patch に status(not_started/in_progress/blocked/done), dueDate("YYYY-MM-DD"|null), progress(0-100の数値), assignee, purpose, currentStatus, completionCriteria, title のいずれか',
  );
  lines.push('- set_step_done: {"goalId","stepTitle","done":true/false}');
  lines.push('- add_log: {"goalId","body"}');
  lines.push(
    '- add_child: {"goalId":"<親ゴールのID>","title":"子ゴールのタイトル","purpose":"目的(任意)"}  // 子ゴール(ToDo)を1つ追加する。複数作るならこのアクションを複数並べる',
  );
  lines.push(
    '- breakdown: {"goalId":"<ゴールのID>"}  // そのゴールをAIが分析して子タスクに自動分解する（子がまだ無いゴール向け）',
  );
  lines.push(
    '- run_implement: {"goalId"}  // そのゴールのClaude Code実装を開始する',
  );
  lines.push(
    "子ゴールを作ってほしい依頼には add_child（複数なら並べる）を使う。『分解して』『細かく分けて』等なら breakdown を使う。",
  );
  lines.push(
    "goalId は必ず下の一覧の id を使うこと。主題タスクが設定されていて対象が明示されていない場合は、主題タスクの id を使う。主題タスクが無く、本当に対象を特定できないときだけ聞き返すこと。",
  );
  lines.push("");

  lines.push(
    `## ゴール一覧（id | 状態 進捗% | タイトル | 親id）${anyRunning() ? "　※現在Claude Code実装が進行中。進捗%は実行中の推定ライブ値を含む" : ""}`,
  );
  lines.push(
    "（進捗%は子ゴールから自動算出され、実行中は推定ライブ値を含む。画面の数値と一致する。手動設定は不要。）",
  );
  for (const g of goals) {
    lines.push(
      `- ${g.id} | ${GOAL_STATUS_LABEL[g.status]} ${computeProgress(g.id, goals)}% | ${g.title} | 親:${g.parentId ?? "なし"}`,
    );
  }
  lines.push("");

  if (history.length > 0) {
    lines.push("## 直近の会話");
    history.slice(-8).forEach((m) => {
      lines.push(`${m.role === "user" ? "ユーザー" : "あなた"}: ${m.content}`);
    });
    lines.push("");
  }

  lines.push("## ユーザーの依頼");
  lines.push(message);
  return lines.join("\n");
}

interface Action {
  type: string;
  goalId?: string;
  patch?: Record<string, unknown>;
  stepTitle?: string;
  done?: boolean;
  body?: string;
  title?: string;
  purpose?: string;
}

function splitActions(raw: string): { reply: string; actions: Action[] } {
  const idx = raw.indexOf(ACTIONS_MARK);
  if (idx < 0) return { reply: raw.trim(), actions: [] };
  const reply = raw.slice(0, idx).trim();
  let tail = raw.slice(idx + ACTIONS_MARK.length).trim();
  // コードフェンスが付く場合を除去。
  tail = tail.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(tail);
    return { reply, actions: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { reply, actions: [] };
  }
}

async function executeActions(actions: Action[]): Promise<string[]> {
  const out: string[] = [];
  for (const a of actions) {
    try {
      const summary = await runOne(a);
      if (summary) out.push(summary);
    } catch (e) {
      out.push(`操作に失敗: ${e instanceof Error ? e.message : "不明なエラー"}`);
    }
  }
  return out;
}

async function runOne(a: Action): Promise<string | null> {
  if (!a.goalId) return null;
  const goal = await getGoal(a.goalId);
  if (!goal) return `ゴールが見つかりません(${a.goalId})`;

  switch (a.type) {
    case "update_goal": {
      const patch = sanitizePatch(a.patch ?? {});
      if (Object.keys(patch).length === 0) return null;
      await updateGoal(a.goalId, patch);
      return `「${goal.title}」を更新: ${describePatch(patch)}`;
    }
    case "set_step_done": {
      const step = goal.steps.find(
        (s) => normalize(s.title) === normalize(a.stepTitle ?? ""),
      );
      if (!step) return `ステップが見つかりません: ${a.stepTitle}`;
      await updateStep(a.goalId, step.id, { done: a.done !== false });
      return `「${goal.title}」のステップ「${step.title}」を${a.done === false ? "未完了" : "完了"}に`;
    }
    case "add_log": {
      if (!a.body) return null;
      await addLog(a.goalId, {
        kind: LOG_KIND.comment,
        author: "AIアシスタント",
        body: a.body,
      });
      return `「${goal.title}」にメモを記録`;
    }
    case "run_implement": {
      await startRun(a.goalId);
      return `「${goal.title}」の実装(Claude Code)を開始`;
    }
    case "add_child": {
      const title = (a.title ?? "").trim();
      if (!title) return "子ゴールのタイトルが空です";
      const child = await createGoal({
        parentId: a.goalId,
        title: title.slice(0, 120),
        desire: "",
        purpose: (a.purpose ?? "").slice(0, 200),
        currentStatus: "",
        completionCriteria: "",
        status: GOAL_STATUS.notStarted,
        assignee: "",
        reviewer: "",
        salesPerson: "",
        dueDate: null,
        kpi: "",
        forecast: "",
        repoPath: "",
        previewCommand: "",
        previewUrl: "",
        estimatedHours: 0,
        progress: 0,
      });
      return `「${goal.title}」に子ゴール「${child.title}」を追加`;
    }
    case "breakdown": {
      const n = await ensureBreakdown(goal);
      return n > 0
        ? `「${goal.title}」をAIで分解し、子タスクを${n}件作成`
        : `「${goal.title}」は既に子ゴールがあるため分解しませんでした（個別に add_child で追加できます）`;
    }
    default:
      return null;
  }
}

// update_goal の patch を安全なフィールドだけに絞る。
function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof patch.status === "string") {
    const s = STATUS_ALIASES[patch.status];
    if (s) out.status = s;
  }
  if (typeof patch.title === "string") out.title = patch.title;
  if (typeof patch.assignee === "string") out.assignee = patch.assignee;
  if (typeof patch.purpose === "string") out.purpose = patch.purpose;
  if (typeof patch.currentStatus === "string")
    out.currentStatus = patch.currentStatus;
  if (typeof patch.completionCriteria === "string")
    out.completionCriteria = patch.completionCriteria;
  if (patch.dueDate === null || typeof patch.dueDate === "string")
    out.dueDate = patch.dueDate;
  if (typeof patch.progress === "number")
    out.progress = Math.max(0, Math.min(100, patch.progress));
  return out;
}

function describePatch(patch: Record<string, unknown>): string {
  const parts: string[] = [];
  if (patch.status) parts.push(`状態=${GOAL_STATUS_LABEL[patch.status as GoalStatus]}`);
  if (patch.progress !== undefined) parts.push(`進捗=${patch.progress}%`);
  if (patch.dueDate !== undefined) parts.push(`期日=${patch.dueDate ?? "なし"}`);
  if (patch.assignee !== undefined) parts.push(`担当=${patch.assignee}`);
  if (patch.title !== undefined) parts.push(`タイトル変更`);
  if (patch.purpose !== undefined) parts.push(`目的更新`);
  if (patch.currentStatus !== undefined) parts.push(`現状更新`);
  if (patch.completionCriteria !== undefined) parts.push(`完了基準更新`);
  return parts.join(" / ") || "変更";
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

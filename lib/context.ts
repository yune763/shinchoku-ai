import {
  Goal,
  GOAL_STATUS,
  GOAL_STATUS_LABEL,
  STEP_ACTOR_LABEL,
} from "./types";
import { ancestorsOf, childrenOf, currentStep, computeProgress } from "./store";

// AIが自分で「どこから始めるか」を判断するための、軽量な機械可読サマリ。
export interface GoalContext {
  id: string;
  title: string;
  desire: string;
  purpose: string;
  status: string;
  progress: number;
  completionCriteria: string;
  path: string[]; // 会社ゴールまでの祖先タイトル
  currentStep: { title: string; actor: string } | null;
  waitingForHuman: boolean; // 現在ステップが人待ちか
  url: string;
}

function toGoalContext(goal: Goal, all: Goal[]): GoalContext {
  const cur = currentStep(goal);
  return {
    id: goal.id,
    title: goal.title,
    desire: goal.desire,
    purpose: goal.purpose,
    status: goal.status,
    progress:
      goal.steps.length > 0 ? goal.progress : computeProgress(goal.id, all),
    completionCriteria: goal.completionCriteria,
    path: ancestorsOf(goal.id, all).map((a) => a.title),
    currentStep: cur ? { title: cur.title, actor: cur.actor } : null,
    waitingForHuman: cur?.actor === "human",
    url: `/goals/${goal.id}`,
  };
}

// プロジェクト全体のコンテキスト＋「次に着手すべき」推薦。
export function buildProjectContext(all: Goal[]) {
  const leaves = all.filter((g) => childrenOf(g.id, all).length === 0);
  const actionable = leaves.filter(
    (g) => g.status !== GOAL_STATUS.done,
  );

  // AIがすぐ動けるもの（現在ステップがAI担当、または未着手）を優先。
  const aiActionable = actionable.filter((g) => {
    const cur = currentStep(g);
    return !cur || cur.actor === "ai";
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalGoals: all.length,
      todo: actionable.length,
      done: leaves.filter((g) => g.status === GOAL_STATUS.done).length,
    },
    recommendedNext: aiActionable
      .slice(0, 5)
      .map((g) => toGoalContext(g, all)),
    waitingForHuman: actionable
      .filter((g) => currentStep(g)?.actor === "human")
      .map((g) => toGoalContext(g, all)),
    allGoals: all.map((g) => toGoalContext(g, all)),
  };
}

// Claude Code 向けの読みやすい説明文（機械可読JSONの前に添える）。
export function projectContextReadme(): string {
  return [
    "# 進捗管理AI — コンテキスト取得ガイド（Claude Code 向け）",
    "",
    "このプロジェクトの進捗・ゴール・現在地は、以下のAPIで取得できます。",
    "",
    "- 全体コンテキスト: `GET /api/context`",
    "- ゴール個別コンテキスト: `GET /api/goals/{id}/context`",
    "- 続きから作業する指示文: `GET /api/goals/{id}/prompt`",
    "",
    "## 開発を始めるときの手順",
    "1. `GET /api/context` を読み、`recommendedNext` の先頭ゴールを対象にする。",
    "2. そのゴールの `GET /api/goals/{id}/prompt` を取得し、指示文に従って着手する。",
    "3. 進めたら `POST /api/goals/{id}/logs`（AI結果）で記録を残す。",
    "4. ステップを終えたら `PATCH /api/goals/{id}/steps/{stepId}` で done:true。",
    "5. `waitingForHuman` のゴールは人の作業待ち。着手せず、必要なら理由を記録する。",
  ].join("\n");
}

export { toGoalContext };

// 人向けの状況サマリ（statusページのデータ源）。
export function statusSummaryText(goal: Goal, all: Goal[]): string {
  const cur = currentStep(goal);
  const done = goal.steps.filter((s) => s.done).length;
  const lines = [
    `状態: ${GOAL_STATUS_LABEL[goal.status]} / 進捗 ${goal.progress}%`,
  ];
  if (goal.steps.length > 0) {
    lines.push(`ステップ: ${done}/${goal.steps.length} 完了`);
    lines.push(
      cur
        ? `現在地: 「${cur.title}」（${STEP_ACTOR_LABEL[cur.actor]}が担当）`
        : "現在地: 全ステップ完了。レビュー待ち。",
    );
  }
  return lines.join("\n");
}

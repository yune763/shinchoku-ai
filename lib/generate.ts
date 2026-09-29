import { Goal, STEP_ACTOR } from "./types";

export interface GeneratedPlan {
  completionCriteria: string;
  purpose: string;
  steps: { title: string; actor: "ai" | "human"; note: string }[];
}

/**
 * したいこと（desire）とタイトルから、完了の基準とステップの「下書き」を作る。
 * ローカルで動くヒューリスティック版。実運用では「AIに依頼する」の指示文で
 * Claude Code に精緻化させ、/api/goals/[id]/plan に書き戻す想定。
 */
export function generatePlanDraft(goal: Goal): GeneratedPlan {
  const what = (goal.desire || goal.title).trim();
  const isBuild = /作|実装|開発|つく|構築|build|作成/i.test(what);

  const purpose =
    goal.purpose ||
    `「${what}」を実現し、親ゴールの前進に貢献する`;

  const completionCriteria = [
    `「${what}」が完成し、実際に使える／レビュー可能な状態になっている`,
    isBuild
      ? "・主要な動作が確認できる（正常系＋主要な異常系）"
      : "・成果物が第三者に共有でき、次のアクションに進める",
    "・完了レビュー（やったこと・成果・申し送り）が記録されている",
  ].join("\n");

  const steps: GeneratedPlan["steps"] = [
    {
      title: "現状とゴールを把握する",
      actor: STEP_ACTOR.ai,
      note: "既存の状況・制約・親ゴールを読み、何が足りないかを1〜3行で整理する",
    },
    {
      title: "進め方（設計・段取り）を決める",
      actor: STEP_ACTOR.ai,
      note: "完了の基準から逆算して手順を決める",
    },
    {
      title: isBuild ? "実装・制作を進める" : "本体の作業を進める",
      actor: STEP_ACTOR.ai,
      note: "続きから実際に手を動かす",
    },
    {
      title: "動作確認・レビュー依頼",
      actor: STEP_ACTOR.human,
      note: "人が結果を確認し、OK/NGをガイドのチェックで伝える",
    },
    {
      title: "完了レビューを記録する",
      actor: STEP_ACTOR.human,
      note: "やったこと・成果・次への申し送りを残す",
    },
  ];

  return { completionCriteria, purpose, steps };
}

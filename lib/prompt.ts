import { Goal, GOAL_STATUS_LABEL, LOG_KIND, STEP_ACTOR_LABEL } from "./types";
import { ancestorsOf, childrenOf, currentStep } from "./store";

const LOG_KIND_LABEL: Record<string, string> = {
  [LOG_KIND.comment]: "コメント/決定",
  [LOG_KIND.deliverable]: "成果物",
  [LOG_KIND.aiRequest]: "AI依頼",
  [LOG_KIND.aiResult]: "AI結果",
  [LOG_KIND.statusChange]: "状態変更",
  [LOG_KIND.stepDone]: "ステップ",
};

/**
 * ゴールの文脈（目的・現状・完了の基準・ロードマップ・現在地・経緯）をまとめて、
 * AIエージェントが「続きから」作業できる指示文を生成する。これがこのシステムの中核。
 */
export function buildAiPrompt(goal: Goal, all: Goal[]): string {
  const ancestors = ancestorsOf(goal.id, all);
  const children = childrenOf(goal.id, all);
  const cur = currentStep(goal);
  const goalUrl = `/goals/${goal.id}`;

  const lines: string[] = [];

  lines.push("あなたは、この会社のゴールに向けて働くAIエージェントです。");
  lines.push(
    "以下の文脈を前提に、前置きなしで『いま着手すべきステップ』から作業を進めてください。",
  );
  lines.push("");

  // ── 何のために（会社ゴールまでの階層） ──
  lines.push("## 何のために（ゴール階層）");
  if (ancestors.length === 0) {
    lines.push("- （このゴールが最上位です）");
  } else {
    ancestors.forEach((a, i) => lines.push(`${"  ".repeat(i)}- ${a.title}`));
  }
  lines.push(`${"  ".repeat(ancestors.length)}- ★ ${goal.title}（← 今回の対象）`);
  lines.push("");

  // ── 対象ゴール ──
  lines.push("## 対象ゴール");
  if (goal.desire) lines.push(`- したいこと: ${goal.desire}`);
  lines.push(`- 目的: ${orDash(goal.purpose)}`);
  lines.push(`- 現状: ${orDash(goal.currentStatus)}`);
  lines.push(`- 完了の基準:\n${indent(orDash(goal.completionCriteria))}`);
  lines.push(`- 状態: ${GOAL_STATUS_LABEL[goal.status]} / 進捗 ${goal.progress}%`);
  lines.push(`- 担当: ${orDash(goal.assignee)} / 期日: ${orDash(goal.dueDate)}`);
  lines.push(`- 参照URL: ${goalUrl}`);
  lines.push("");

  // ── ロードマップ（現在地つき） ──
  if (goal.steps.length > 0) {
    lines.push("## ロードマップ（道のりと現在地）");
    goal.steps.forEach((s, i) => {
      const mark = s.done ? "[x]" : s.id === cur?.id ? "[→]" : "[ ]";
      const who = `(${STEP_ACTOR_LABEL[s.actor]})`;
      const note = s.note ? ` — ${s.note}` : "";
      lines.push(`${i + 1}. ${mark} ${who} ${s.title}${note}`);
    });
    lines.push("");
    if (cur) {
      lines.push(`▶ いま着手すべき: 「${cur.title}」（担当: ${STEP_ACTOR_LABEL[cur.actor]}）`);
    } else {
      lines.push("▶ 全ステップ完了済み。完了レビューの記録に進んでください。");
    }
    lines.push("");
  }

  // ── 子タスク ──
  if (children.length > 0) {
    lines.push("## 子タスク");
    children.forEach((c) =>
      lines.push(`- [${GOAL_STATUS_LABEL[c.status]}/${c.progress}%] ${c.title}`),
    );
    lines.push("");
  }

  // ── これまでの経緯 ──
  lines.push("## これまでの経緯（新しい順）");
  const logs = [...goal.logs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (logs.length === 0) {
    lines.push("- （記録なし）");
  } else {
    logs.slice(0, 20).forEach((l) => {
      const date = l.createdAt.slice(0, 10);
      lines.push(
        `- [${date}][${LOG_KIND_LABEL[l.kind] ?? l.kind}] ${l.author}: ${l.body}`,
      );
    });
  }
  lines.push("");

  // ── 依頼 ──
  lines.push("## お願いしたいこと");
  lines.push("1. 上の『いま着手すべきステップ』を、続きから実際に進める。");
  lines.push(
    "2. 完了の基準に対して、いま何が足りないかを1〜3行で整理してから作業する。",
  );
  lines.push(
    "3. 進めたら結果と『次にやること』をまとめる（この対象ゴールに記録として残す想定）。",
  );
  lines.push("");
  lines.push(
    "※ 前提の再説明は不要です。上の文脈がそのまま前提です。人の作業待ちのステップがある場合は、それを明示してこちらの作業を進めてください。",
  );

  return lines.join("\n");
}

function orDash(v: string | null | undefined): string {
  return v && v.trim() ? v : "—（未記入）";
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

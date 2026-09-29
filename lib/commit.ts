import { Goal, LOG_KIND } from "./types";
import { listGoals, getGoal, addLog, updateStep, currentStep } from "./store";
import { getSettings } from "./settings";

export interface CommitInput {
  hash: string;
  subject: string;
  body?: string;
  author?: string;
  branch?: string;
  files?: string[];
}

export interface CommitResult {
  matchedGoalId: string | null;
  matchedBy: "message-ref" | "active-goal" | "none";
  advancedStep: string | null;
}

// コミットメッセージ中の [goal:<id>] でゴールを明示できる。
const GOAL_REF = /\[goal:([a-zA-Z0-9-]+)\]/;
// [done] があれば現在ステップを完了にする。
const DONE_MARK = /\[done\]/i;

/**
 * gitコミットを進捗に反映する。宛先ゴールは
 * 1) メッセージの [goal:<id>] 、なければ 2) 作業中ゴール。
 * どちらも無ければ記録しない。
 */
export async function recordCommit(input: CommitInput): Promise<CommitResult> {
  const all = await listGoals();
  const target = await resolveTargetGoal(input, all);
  if (!target) {
    return { matchedGoalId: null, matchedBy: "none", advancedStep: null };
  }

  const matchedBy: CommitResult["matchedBy"] = GOAL_REF.test(input.subject + (input.body ?? ""))
    ? "message-ref"
    : "active-goal";

  const shortHash = input.hash.slice(0, 7);
  const fileLine =
    input.files && input.files.length
      ? `\n変更 ${input.files.length} ファイル: ${input.files.slice(0, 8).join(", ")}${input.files.length > 8 ? " ほか" : ""}`
      : "";
  const body = `[${shortHash}] ${input.subject}${input.branch ? `（${input.branch}）` : ""}${fileLine}`;

  await addLog(target.id, {
    kind: LOG_KIND.commit,
    author: input.author || "git",
    body,
  });

  // 現状をコミット件名で更新（AI/人が最新状況を掴めるように）。
  const { updateGoal } = await import("./store");
  await updateGoal(target.id, { currentStatus: `直近コミット: ${input.subject}` });

  // [done] マーカーで現在ステップを前進。
  let advancedStep: string | null = null;
  if (DONE_MARK.test(input.subject + (input.body ?? ""))) {
    const fresh = await getGoal(target.id);
    const cur = fresh ? currentStep(fresh) : null;
    if (fresh && cur) {
      await updateStep(target.id, cur.id, { done: true });
      advancedStep = cur.title;
    }
  }

  return { matchedGoalId: target.id, matchedBy, advancedStep };
}

async function resolveTargetGoal(
  input: CommitInput,
  all: Goal[],
): Promise<Goal | null> {
  const m = (input.subject + " " + (input.body ?? "")).match(GOAL_REF);
  if (m) {
    const byRef = all.find((g) => g.id === m[1] || g.id.startsWith(m[1]));
    if (byRef) return byRef;
  }
  const settings = await getSettings();
  if (settings.activeGoalId) {
    return all.find((g) => g.id === settings.activeGoalId) ?? null;
  }
  return null;
}

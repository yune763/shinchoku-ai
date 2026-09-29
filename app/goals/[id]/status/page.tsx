import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGoal,
  listGoals,
  ancestorsOf,
  childrenOf,
  computeProgress,
  currentStep,
} from "@/lib/store";
import { GOAL_STATUS_LABEL, STEP_ACTOR_LABEL, LOG_KIND } from "@/lib/types";
import { StatusBadge, ProgressBar } from "@/components/ui";

export const dynamic = "force-dynamic";

const LOG_KIND_LABEL: Record<string, string> = {
  [LOG_KIND.comment]: "コメント",
  [LOG_KIND.deliverable]: "成果物",
  [LOG_KIND.aiRequest]: "AI依頼",
  [LOG_KIND.aiResult]: "AI結果",
  [LOG_KIND.statusChange]: "状態変更",
  [LOG_KIND.stepDone]: "ステップ",
};

// 人が一目で「いまどういう状況か」を把握するためのまとめページ。
export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) notFound();
  const all = await listGoals();
  const ancestors = ancestorsOf(id, all);
  const children = childrenOf(id, all);
  const isLeaf = children.length === 0;
  const progress = isLeaf ? goal.progress : computeProgress(id, all);
  const cur = currentStep(goal);
  const doneCount = goal.steps.filter((s) => s.done).length;
  const recentLogs = [...goal.logs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <nav className="text-sm text-ink-muted dark:text-slate-400 flex flex-wrap gap-1">
        <Link href={`/goals/${goal.id}`} className="hover:text-brand">
          ← ゴール詳細に戻る
        </Link>
      </nav>

      {ancestors.length > 0 && (
        <p className="text-xs text-ink-muted dark:text-slate-500">
          {ancestors.map((a) => a.title).join(" › ")}
        </p>
      )}
      <div>
        <h1 className="text-2xl font-bold dark:text-white">{goal.title}</h1>
        <div className="flex items-center gap-3 mt-2">
          <StatusBadge status={goal.status} />
          <span className="text-sm text-ink-muted dark:text-slate-400">
            担当 {goal.assignee || "—"} ・ 期日 {goal.dueDate || "—"}
          </span>
        </div>
      </div>

      {/* いまの状況 */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="font-semibold dark:text-white">いまの状況</h2>
        <div className="flex items-center gap-3">
          <ProgressBar value={progress} />
          <span className="text-sm font-medium tabular-nums dark:text-slate-300">
            {progress}%
          </span>
        </div>
        {goal.steps.length > 0 && (
          <p className="text-sm dark:text-slate-300">
            ステップ {doneCount}/{goal.steps.length} 完了。
            {cur ? (
              <>
                現在地は
                <span className="font-semibold text-brand">
                  「{cur.title}」
                </span>
                （{STEP_ACTOR_LABEL[cur.actor]}が担当）。
              </>
            ) : (
              " 全ステップ完了。レビュー待ち。"
            )}
          </p>
        )}
        {goal.currentStatus && (
          <p className="text-sm text-ink-soft dark:text-slate-300 whitespace-pre-wrap">
            {goal.currentStatus}
          </p>
        )}
      </div>

      {/* ロードマップ（読み取り専用） */}
      {goal.steps.length > 0 && (
        <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-semibold dark:text-white mb-3">道のり</h2>
          <ol className="space-y-2">
            {goal.steps.map((s, i) => {
              const isCurrent = s.id === cur?.id;
              return (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={[
                      "h-5 w-5 rounded-full flex items-center justify-center text-xs shrink-0",
                      s.done
                        ? "bg-green-500 text-white"
                        : isCurrent
                          ? "bg-brand text-white"
                          : "bg-slate-200 dark:bg-slate-700 text-ink-muted",
                    ].join(" ")}
                  >
                    {s.done ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={
                      s.done
                        ? "line-through text-ink-muted dark:text-slate-500"
                        : "dark:text-slate-200"
                    }
                  >
                    {s.title}
                  </span>
                  <span className="text-[10px] rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-ink-muted">
                    {STEP_ACTOR_LABEL[s.actor]}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-brand text-white">
                      現在地
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* 完了の基準 */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="font-semibold dark:text-white mb-2">完了の基準</h2>
        <p className="text-sm whitespace-pre-wrap dark:text-slate-200">
          {goal.completionCriteria || "—（未記入）"}
        </p>
      </div>

      {/* レビュー */}
      {goal.review && (
        <div className="rounded-card border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 p-5 space-y-2">
          <h2 className="font-semibold text-green-800 dark:text-green-300">
            完了レビュー
          </h2>
          <p className="text-sm dark:text-slate-200">
            <b>やったこと:</b> {goal.review.summary}
          </p>
          <p className="text-sm dark:text-slate-200">
            <b>成果:</b> {goal.review.outcome}
          </p>
          <p className="text-sm dark:text-slate-200">
            <b>申し送り:</b> {goal.review.learnings}
          </p>
        </div>
      )}

      {/* 直近の動き */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="font-semibold dark:text-white mb-3">直近の動き</h2>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-slate-400">
            まだ記録がありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {recentLogs.map((l) => (
              <li key={l.id} className="text-sm dark:text-slate-200">
                <span className="text-xs text-ink-muted dark:text-slate-500">
                  {l.createdAt.slice(0, 10)} ・{" "}
                  {LOG_KIND_LABEL[l.kind] ?? l.kind} ・ {l.author}：
                </span>{" "}
                {l.body}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

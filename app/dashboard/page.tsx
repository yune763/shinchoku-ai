import Link from "next/link";
import { listGoals, computeProgress, childrenOf } from "@/lib/store";
import { GOAL_STATUS, GOAL_STATUS_LABEL, GoalStatus } from "@/lib/types";
import { StatusBadge, ProgressBar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const goals = await listGoals();
  const roots = childrenOf(null, goals);

  const counts: Record<GoalStatus, number> = {
    [GOAL_STATUS.notStarted]: 0,
    [GOAL_STATUS.inProgress]: 0,
    [GOAL_STATUS.blocked]: 0,
    [GOAL_STATUS.done]: 0,
  };
  goals.forEach((g) => (counts[g.status] += 1));

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <PageHeader
        title="ダッシュボード"
        desc="会社のゴールが、いまどこまで進んでいるか。報告を待たずに分かる。"
      />

      {/* サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {(Object.keys(counts) as GoalStatus[]).map((s) => (
          <div
            key={s}
            className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="text-xs text-ink-muted dark:text-slate-400">
              {GOAL_STATUS_LABEL[s]}
            </div>
            <div className="text-2xl font-bold mt-1 dark:text-white">
              {counts[s]}
            </div>
          </div>
        ))}
      </div>

      {/* 会社ゴール一覧 */}
      <h2 className="text-lg font-semibold mb-3 dark:text-white">会社のゴール</h2>
      {roots.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {roots.map((g) => {
            const progress = computeProgress(g.id, goals);
            const kids = childrenOf(g.id, goals);
            return (
              <Link
                key={g.id}
                href={`/goals/${g.id}`}
                className="block rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-semibold dark:text-white">{g.title}</span>
                  <StatusBadge status={g.status} />
                </div>
                <p className="text-sm text-ink-muted dark:text-slate-400 mb-3">
                  {g.purpose || "目的が未記入です"}
                </p>
                <div className="flex items-center gap-3">
                  <ProgressBar value={progress} />
                  <span className="text-sm font-medium tabular-nums dark:text-slate-300">
                    {progress}%
                  </span>
                </div>
                <div className="text-xs text-ink-muted dark:text-slate-500 mt-2">
                  子ゴール {kids.length} 件 ・ 担当 {g.assignee || "—"} ・ 期日{" "}
                  {g.dueDate || "—"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-ink-muted dark:text-slate-400">
      まだゴールがありません。
      <Link href="/goals" className="text-brand font-medium ml-1">
        ゴールツリーから追加
      </Link>
      してください。
    </div>
  );
}

import Link from "next/link";
import { listGoals, childrenOf, ancestorsOf } from "@/lib/store";
import { getCurrentUser } from "@/lib/session";
import { GOAL_STATUS } from "@/lib/types";
import { StatusBadge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// 末端（子を持たない）ゴール＝実際に手を動かすToDo。未完了のものを一覧。
// ログイン中アカウント（実装担当）のToDoだけを表示する。
export default async function TodayPage() {
  const [goals, me] = await Promise.all([listGoals(), getCurrentUser()]);
  const meName = me?.displayName ?? "";
  const leaves = goals.filter(
    (g) =>
      childrenOf(g.id, goals).length === 0 &&
      g.status !== GOAL_STATUS.done &&
      g.assignee === meName,
  );

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <PageHeader
        title="今日のToDo"
        desc="あなたが実装担当の、未完了のToDoです。何のためにやるかは親をたどれば分かります。"
      />

      {leaves.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-ink-muted dark:text-slate-400">
          未完了のToDoはありません。お疲れさまです。
        </div>
      ) : (
        <div className="space-y-2">
          {leaves.map((g) => {
            const chain = ancestorsOf(g.id, goals);
            const breadcrumb = chain.map((a) => a.title).join(" › ");
            return (
              <Link
                key={g.id}
                href={`/goals/${g.id}`}
                className="flex items-center gap-3 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-brand transition-colors"
              >
                <div className="flex-1 min-w-0">
                  {breadcrumb && (
                    <div className="text-xs text-ink-muted dark:text-slate-500 truncate">
                      {breadcrumb}
                    </div>
                  )}
                  <div className="font-medium dark:text-white truncate">
                    {g.title}
                  </div>
                </div>
                <span className="text-xs text-ink-muted dark:text-slate-500">
                  {g.assignee || "—"}
                </span>
                <StatusBadge status={g.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

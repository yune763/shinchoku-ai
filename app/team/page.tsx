import Link from "next/link";
import { listGoals, childrenOf, computeProgress } from "@/lib/store";
import { listUsers } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/session";
import { GOAL_STATUS, type Goal } from "@/lib/types";
import { StatusBadge, ProgressBar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// メンバー進捗：登録済みメンバー（自分以外）のゴール進捗をすべて反映する。
// ゴールの担当者(assignee)＝アカウントの表示名(氏 名) で紐づける。
export default async function TeamPage() {
  const me = await getCurrentUser();
  const [users, goals] = await Promise.all([listUsers(), listGoals()]);

  // 承認済み・自分以外のメンバー。
  const members = users.filter(
    (u) => u.status === "approved" && u.id !== me?.id,
  );

  // 担当ゴール（末端優先でそのメンバーが担当のもの）。
  function goalsOf(displayName: string): Goal[] {
    return goals.filter((g) => g.assignee && g.assignee === displayName);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <PageHeader
        title="メンバー進捗"
        desc="登録済みメンバー（自分以外）のゴール進捗をすべて表示します。"
      />

      {members.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 p-10 text-center text-ink-muted">
          他のメンバーがまだいません（承認後にここへ表示されます）。
        </div>
      ) : (
        <div className="space-y-6">
          {members.map((u) => {
            const assigned = goalsOf(u.displayName);
            const done = assigned.filter(
              (g) => g.status === GOAL_STATUS.done,
            ).length;
            const avg =
              assigned.length === 0
                ? 0
                : Math.round(
                    assigned.reduce(
                      (s, g) => s + computeProgress(g.id, goals),
                      0,
                    ) / assigned.length,
                  );
            return (
              <section
                key={u.id}
                className="rounded-card border border-slate-200 bg-white p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-sm font-bold text-ink-soft">
                      {u.displayName.slice(0, 1)}
                    </span>
                    <div>
                      <div className="font-bold text-ink">{u.displayName}</div>
                      <div className="text-xs text-ink-muted">
                        担当 {assigned.length} ・ 完了 {done}
                        {u.claudeLinked && (
                          <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Claude連携
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="w-32">
                    <ProgressBar value={avg} />
                    <div className="mt-0.5 text-right text-xs text-ink-muted">
                      平均 {avg}%
                    </div>
                  </div>
                </div>

                {assigned.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    担当ゴールはありません。
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {assigned.map((g) => {
                      const leaf = childrenOf(g.id, goals).length === 0;
                      const prog = computeProgress(g.id, goals);
                      return (
                        <li key={g.id}>
                          <Link
                            href={`/goals/${g.id}`}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:border-brand"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                              {g.title}
                              {!leaf && (
                                <span className="ml-1 text-xs text-ink-muted">
                                  （まとめ）
                                </span>
                              )}
                            </span>
                            <span className="w-24 shrink-0">
                              <ProgressBar value={prog} />
                            </span>
                            <StatusBadge status={g.status} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

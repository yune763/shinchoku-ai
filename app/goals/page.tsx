import Link from "next/link";
import { listGoals, childrenOf, computeProgress } from "@/lib/store";
import { Goal } from "@/lib/types";
import { StatusBadge, PageHeader } from "@/components/ui";
import { NewGoalForm } from "@/components/NewGoalForm";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await listGoals();
  const roots = childrenOf(null, goals);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <PageHeader
        title="ゴールツリー"
        desc="会社ゴールから今日のToDoまで、ひとつの階層で。すべてのToDoが『何のために』につながる。"
      />

      <NewGoalForm goals={goals} />

      <div className="mt-6 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {roots.length === 0 ? (
          <div className="p-8 text-center text-ink-muted dark:text-slate-400">
            まだゴールがありません。上のフォームから最初のゴールを置きましょう。
          </div>
        ) : (
          roots.map((g) => <TreeRow key={g.id} goal={g} all={goals} depth={0} />)
        )}
      </div>
    </div>
  );
}

function TreeRow({
  goal,
  all,
  depth,
}: {
  goal: Goal;
  all: Goal[];
  depth: number;
}) {
  const kids = childrenOf(goal.id, all);
  const progress = computeProgress(goal.id, all);
  return (
    <>
      <Link
        href={`/goals/${goal.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
      >
        <span className="text-ink-muted dark:text-slate-500 text-xs">
          {kids.length > 0 ? "▶" : "•"}
        </span>
        <span className="flex-1 min-w-0 truncate dark:text-slate-200">
          {goal.title}
        </span>
        <span className="text-xs text-ink-muted dark:text-slate-500 tabular-nums hidden sm:inline">
          {goal.assignee || "—"}
        </span>
        <span className="text-xs text-ink-muted dark:text-slate-500 tabular-nums w-10 text-right">
          {progress}%
        </span>
        <StatusBadge status={goal.status} />
      </Link>
      {kids.map((k) => (
        <TreeRow key={k.id} goal={k} all={all} depth={depth + 1} />
      ))}
    </>
  );
}

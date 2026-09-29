import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGoal,
  listGoals,
  ancestorsOf,
  childrenOf,
  computeProgress,
} from "@/lib/store";
import { GoalDetail } from "@/components/GoalDetail";

export const dynamic = "force-dynamic";

export default async function GoalPage({
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
  const computedProgress = computeProgress(id, all);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      {/* パンくず */}
      <nav className="text-sm text-ink-muted dark:text-slate-400 mb-4 flex flex-wrap items-center gap-1">
        <Link href="/goals" className="hover:text-brand">
          ゴール
        </Link>
        {ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <span>›</span>
            <Link href={`/goals/${a.id}`} className="hover:text-brand">
              {a.title}
            </Link>
          </span>
        ))}
      </nav>

      <GoalDetail
        goal={goal}
        all={all}
        children={children}
        computedProgress={computedProgress}
      />
    </div>
  );
}

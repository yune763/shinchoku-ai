import Link from "next/link";
import { notFound } from "next/navigation";
import { getGoal, listGoals, currentStep } from "@/lib/store";
import { STEP_ACTOR, STEP_ACTOR_LABEL } from "@/lib/types";
import { Roadmap } from "@/components/Roadmap";

export const dynamic = "force-dynamic";

// 人がやることをチェックボックスで完了/未完了にし、AIに伝えるためのガイド。
export default async function GuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) notFound();
  await listGoals();

  const humanSteps = goal.steps.filter((s) => s.actor === STEP_ACTOR.human);
  const cur = currentStep(goal);
  const waitingOnHuman = cur?.actor === STEP_ACTOR.human;

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
      <nav className="text-sm text-ink-muted dark:text-slate-400">
        <Link href={`/goals/${goal.id}`} className="hover:text-brand">
          ← ゴール詳細に戻る
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-bold dark:text-white">作業ガイド</h1>
        <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">
          {goal.title}
        </p>
      </div>

      {/* 現在地の案内 */}
      <div
        className={[
          "rounded-card p-4 text-sm",
          waitingOnHuman
            ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300"
            : "bg-brand-bg dark:bg-blue-900/20 border border-brand/30 text-ink-soft dark:text-slate-300",
        ].join(" ")}
      >
        {cur ? (
          waitingOnHuman ? (
            <>
              いまは<b>あなた（人）</b>の番です。「{cur.title}」を終えたら
              下のチェックを入れてください。チェックするとAIが次に進めます。
            </>
          ) : (
            <>
              いまは<b>AI（{STEP_ACTOR_LABEL[cur.actor]}）</b>が
              「{cur.title}」を進める番です。人の作業が出てきたらここに表示されます。
            </>
          )
        ) : (
          <>すべてのステップが完了しています。完了レビューを記録しましょう。</>
        )}
      </div>

      {/* 人がやること（チェックボックス） */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="font-semibold dark:text-white">
          あなたにやってほしいこと
        </h2>
        {humanSteps.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-slate-400">
            人の作業として登録されたステップはありません。
            ゴール詳細のロードマップで「人」のステップを追加できます。
          </p>
        ) : (
          <Roadmap goal={goal} editable onlyHuman />
        )}
        <p className="text-xs text-ink-muted dark:text-slate-500">
          ※ チェックの状態はそのままAIのコンテキストに反映されます（AIは「人待ち」かどうかを判断できます）。
        </p>
      </div>

      {/* 全体の道のり（参考） */}
      {goal.steps.length > 0 && (
        <details className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <summary className="font-semibold dark:text-white cursor-pointer">
            全体の道のりを見る（AI担当も含む）
          </summary>
          <ol className="mt-3 space-y-1 text-sm">
            {goal.steps.map((s, i) => (
              <li key={s.id} className="dark:text-slate-300">
                {i + 1}. {s.done ? "（済）" : ""}
                {s.title}{" "}
                <span className="text-xs text-ink-muted">
                  （{STEP_ACTOR_LABEL[s.actor]}）
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

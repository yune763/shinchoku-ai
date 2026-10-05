import { listGoals, computeProgress, childrenOf } from "@/lib/store";
import { GOAL_STATUS, GOAL_STATUS_LABEL, GoalStatus, Goal } from "@/lib/types";
import { PageHeader, ProgressBar } from "@/components/ui";
import { CompletionChart, TimeDonut, TimeSlice } from "@/components/GoalsCharts";
import { listProposals, PROPOSAL_KIND_LABEL } from "@/lib/proposals";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86_400_000;

export default async function AnalyticsPage() {
  const goals = await listGoals();
  const proposals = await listProposals();
  const total = goals.length;
  const done = goals.filter((g) => g.status === GOAL_STATUS.done);
  const inProgress = goals.filter((g) => g.status === GOAL_STATUS.inProgress);
  const blocked = goals.filter((g) => g.status === GOAL_STATUS.blocked);
  const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

  // 平均完了日数（作成〜完了）。
  const durations: number[] = [];
  for (const g of done) {
    const start = new Date(g.createdAt).getTime();
    const end = new Date(g.review?.reviewedAt ?? g.updatedAt).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      durations.push((end - start) / MS_PER_DAY);
    }
  }
  const avgDays =
    durations.length > 0
      ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)
      : "—";

  // 完了推移。
  const completions = done.map((g) => g.review?.reviewedAt ?? g.updatedAt);

  // ステータス構成（ドーナツ）。
  const statusSlices: TimeSlice[] = (
    [
      GOAL_STATUS.inProgress,
      GOAL_STATUS.done,
      GOAL_STATUS.blocked,
      GOAL_STATUS.notStarted,
    ] as GoalStatus[]
  )
    .map((s) => ({
      label: GOAL_STATUS_LABEL[s],
      count: goals.filter((g) => g.status === s).length,
    }))
    .filter((s) => s.count > 0);

  // 実績時間の割合（作成〜完了の経過時間）。
  const HOUR_BUCKETS = [
    { label: "〜1時間", max: 1 },
    { label: "1〜4時間", max: 4 },
    { label: "4〜8時間", max: 8 },
    { label: "8〜24時間", max: 24 },
    { label: "1日以上", max: Infinity },
  ];
  const bucketCounts = HOUR_BUCKETS.map(() => 0);
  for (const g of done) {
    const start = new Date(g.createdAt).getTime();
    const end = new Date(g.review?.reviewedAt ?? g.updatedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
    const hours = (end - start) / 3_600_000;
    const idx = HOUR_BUCKETS.findIndex((b) => hours <= b.max);
    if (idx >= 0) bucketCounts[idx] += 1;
  }
  const timeSlices: TimeSlice[] = HOUR_BUCKETS.map((b, i) => ({
    label: b.label,
    count: bucketCounts[i],
  })).filter((s) => s.count > 0);

  // 担当者別（件数・完了・進捗平均）。葉タスクのみを対象にする。
  const leaves = goals.filter((g) => childrenOf(g.id, goals).length === 0);
  const byAssignee = new Map<
    string,
    { total: number; done: number; progressSum: number }
  >();
  for (const g of leaves) {
    const key = g.assignee?.trim() || "未割当";
    const cur = byAssignee.get(key) ?? { total: 0, done: 0, progressSum: 0 };
    cur.total += 1;
    if (g.status === GOAL_STATUS.done) cur.done += 1;
    cur.progressSum += computeProgress(g.id, goals);
    byAssignee.set(key, cur);
  }
  const assignees = [...byAssignee.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      done: v.done,
      avgProgress: Math.round(v.progressSum / v.total),
    }))
    .sort((a, b) => b.total - a.total);

  // ── 開発提案 → 実装 の分析 ──
  // 提案タイトルと同名のゴールが「実装として起票された」と判定する。
  const goalByTitle = new Map<string, Goal>(goals.map((g) => [g.title, g]));
  const propStats = proposals.map((p) => ({
    proposal: p,
    goal: goalByTitle.get(p.title) ?? null,
  }));
  const propTotal = proposals.length;
  const implemented = propStats.filter((s) => s.goal);
  const propStarted = implemented.filter(
    (s) => s.goal!.status !== GOAL_STATUS.notStarted,
  ).length;
  const propDone = implemented.filter(
    (s) => s.goal!.status === GOAL_STATUS.done,
  ).length;
  const funnel = [
    { label: "提案", count: propTotal },
    { label: "起票（実装化）", count: implemented.length },
    { label: "着手（進行中以上）", count: propStarted },
    { label: "完了", count: propDone },
  ];
  const implementRate =
    propTotal > 0 ? Math.round((implemented.length / propTotal) * 100) : 0;

  // 提案の種類別（件数）。
  const kindCount = new Map<string, number>();
  for (const p of proposals) {
    kindCount.set(p.kind, (kindCount.get(p.kind) ?? 0) + 1);
  }
  const kindSlices: TimeSlice[] = [...kindCount.entries()]
    .map(([k, count]) => ({ label: PROPOSAL_KIND_LABEL[k] ?? "その他", count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="p-6 md:p-8 w-full">
        <PageHeader
          title="アナリティクス"
          desc="ゴールの完了状況・所要時間・担当者別の負荷を俯瞰する分析ビュー。"
        />

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Kpi label="総ゴール数" value={String(total)} />
          <Kpi label="完了率" value={`${completionRate}%`} accent />
          <Kpi label="進行中" value={String(inProgress.length)} />
          <Kpi label="停滞" value={String(blocked.length)} />
          <Kpi label="平均完了日数" value={avgDays === "—" ? "—" : `${avgDays}日`} />
        </div>

        {/* 完了推移 */}
        <div className="mt-4 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <CompletionChart completions={completions} />
        </div>

        {/* 構成ドーナツ */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <TimeDonut slices={statusSlices} title="ステータス構成" />
          </div>
          <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <TimeDonut slices={timeSlices} title="実績時間の割合" />
          </div>
        </div>

        {/* 担当者別 */}
        <div className="mt-4 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-semibold dark:text-white mb-4">担当者別の負荷</h2>
          {assignees.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-slate-400">
              対象タスクがありません。
            </p>
          ) : (
            <div className="space-y-3">
              {assignees.map((a) => (
                <div key={a.name} className="flex items-center gap-4">
                  <span className="w-28 shrink-0 truncate text-sm dark:text-slate-200">
                    {a.name}
                  </span>
                  <div className="flex-1">
                    <ProgressBar value={a.avgProgress} />
                  </div>
                  <span className="w-14 text-right text-xs tabular-nums text-ink-muted dark:text-slate-400">
                    {a.avgProgress}%
                  </span>
                  <span className="w-24 text-right text-xs tabular-nums text-ink-muted dark:text-slate-400">
                    完了 {a.done}/{a.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 開発提案 → 実装 の分析 */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ファネル */}
          <div className="lg:col-span-2 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold dark:text-white">
                開発提案 → 実装 ファネル
              </h2>
              <span className="text-sm text-ink-muted dark:text-slate-400">
                実装化率{" "}
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {implementRate}%
                </span>
              </span>
            </div>
            {propTotal === 0 ? (
              <p className="text-sm text-ink-muted dark:text-slate-400">
                提案がまだありません。
              </p>
            ) : (
              <div className="space-y-3">
                {funnel.map((f) => {
                  const pct =
                    propTotal > 0 ? Math.round((f.count / propTotal) * 100) : 0;
                  return (
                    <div key={f.label} className="flex items-center gap-4">
                      <span className="w-36 shrink-0 text-sm dark:text-slate-200">
                        {f.label}
                      </span>
                      <div className="flex-1 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-lg bg-indigo-500 flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(pct, 3)}%` }}
                        >
                          <span className="text-[11px] font-semibold text-white tabular-nums">
                            {f.count}
                          </span>
                        </div>
                      </div>
                      <span className="w-10 text-right text-xs tabular-nums text-ink-muted dark:text-slate-400">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 提案の種類別 */}
          <div className="lg:col-span-1 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <TimeDonut slices={kindSlices} title="提案の種類別" vertical />
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4">
      <div className="text-xs text-ink-muted dark:text-slate-400">{label}</div>
      <div
        className={[
          "text-3xl font-bold tabular-nums mt-1",
          accent ? "text-indigo-600 dark:text-indigo-400" : "text-ink dark:text-white",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

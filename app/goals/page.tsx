import {
  listGoals,
  childrenOf,
  computeProgress,
  estimateHours,
} from "@/lib/store";
import { overlayLiveProgress } from "@/lib/claude-runner";
import { GoalTree, TreeNode } from "@/components/GoalTree";
import { Goal, GOAL_STATUS, GOAL_STATUS_LABEL, GoalStatus } from "@/lib/types";
import { PageHeader, ProgressBar } from "@/components/ui";
import { NewGoalForm } from "@/components/NewGoalForm";
import { CompletionChart, TimeDonut, TimeSlice } from "@/components/GoalsCharts";
import { TreeAutoRefresh } from "@/components/TreeAutoRefresh";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// ステータスの表示順と、控えめなアクセント色（NEXUS風のミニマル配色）。
const STATUS_ORDER: GoalStatus[] = [
  GOAL_STATUS.inProgress,
  GOAL_STATUS.done,
  GOAL_STATUS.blocked,
  GOAL_STATUS.notStarted,
];
const STATUS_DOT: Record<GoalStatus, string> = {
  [GOAL_STATUS.inProgress]: "bg-indigo-500",
  [GOAL_STATUS.done]: "bg-emerald-500",
  [GOAL_STATUS.blocked]: "bg-amber-500",
  [GOAL_STATUS.notStarted]: "bg-slate-400",
};

export default async function GoalsPage() {
  // 実行中の対象ゴールはライブ進捗を重ねて表示（TreeAutoRefreshが数秒ごとに再描画）。
  const goals = overlayLiveProgress(await listGoals());
  const { activeGoalId } = await getSettings();

  // このページはログイン中アカウント専用。担当(assignee)が自分のゴールのみ表示する。
  // 他メンバーの進捗確認は「メンバー進捗」ページで行う。
  const me = await getCurrentUser();
  const meName = me?.displayName ?? "";
  const byId = new Map(goals.map((g) => [g.id, g] as const));
  const isMine = (g: Goal) => !!meName && g.assignee === meName;
  // 祖先に自分担当のゴールがあるか（＝その配下は表示ルートにしない）。
  const anyAncestorMine = (g: Goal): boolean => {
    let pid = g.parentId;
    while (pid) {
      const p = byId.get(pid);
      if (!p) break;
      if (isMine(p)) return true;
      pid = p.parentId;
    }
    return false;
  };
  // 表示ルート＝自分担当で、より上位に自分担当がないゴール。その配下は丸ごと表示する。
  const displayRoots = goals.filter((g) => isMine(g) && !anyAncestorMine(g));
  // 表示対象(自分ルート＋その子孫)のIDを集める。集計はこの範囲で行う。
  const visibleIds = new Set<string>();
  const collect = (id: string) => {
    if (visibleIds.has(id)) return;
    visibleIds.add(id);
    childrenOf(id, goals).forEach((c) => collect(c.id));
  };
  displayRoots.forEach((r) => collect(r.id));
  const visibleGoals = goals.filter((g) => visibleIds.has(g.id));
  const roots = displayRoots;

  // 折りたたみ可能なツリー用に、各ノードの表示値をサーバー側で算出しておく。
  const buildNode = (g: Goal): TreeNode => {
    const comments = (g.logs ?? []).filter((l) => l.kind === "comment");
    const lastCommentAt =
      comments.reduce((max, l) => (l.createdAt > max ? l.createdAt : max), "") ||
      null;
    return {
      id: g.id,
      title: g.title,
      status: g.status,
      dueDate: g.dueDate,
      assignee: g.assignee,
      progress: computeProgress(g.id, goals),
      descCount: countDescendants(g.id, goals),
      estimatedHours: estimateHours(g.id, goals),
      isActive: g.id === activeGoalId,
      commentCount: comments.length,
      lastCommentAt,
      children: childrenOf(g.id, goals).map(buildNode),
    };
  };
  const tree: TreeNode[] = roots.map(buildNode);

  // ── サマリ集計（自分の担当範囲のみ） ──
  const statusCounts = STATUS_ORDER.map((s) => ({
    status: s,
    count: visibleGoals.filter((g) => g.status === s).length,
  }));
  const countOf = (s: GoalStatus) =>
    visibleGoals.filter((g) => g.status === s).length;

  // 全体の進捗率（会社ゴール＝ルートの算出進捗の平均）。
  const overall =
    roots.length === 0
      ? 0
      : Math.round(
          roots.reduce((acc, r) => acc + computeProgress(r.id, goals), 0) /
            roots.length,
        );

  // 期日の集計（期日ありのゴールが対象）。
  const now = new Date();
  const ym = now.getFullYear() * 12 + now.getMonth();
  let dueThisMonth = 0;
  let dueLater = 0;
  for (const g of visibleGoals) {
    if (!g.dueDate) continue;
    const d = new Date(g.dueDate);
    if (Number.isNaN(d.getTime())) continue;
    const gym = d.getFullYear() * 12 + d.getMonth();
    if (gym === ym) dueThisMonth += 1;
    else if (gym > ym) dueLater += 1;
  }

  // 完了イベント（面グラフ用）。完了ゴールのレビュー日 or 更新日。
  const completed = visibleGoals.filter((g) => g.status === GOAL_STATUS.done);
  const completions = completed.map((g) => g.review?.reviewedAt ?? g.updatedAt);

  // 実績時間（作成〜完了の経過時間）を時間帯で集計（ドーナツ用）。
  const HOUR_BUCKETS = [
    { label: "〜1時間", max: 1 },
    { label: "1〜4時間", max: 4 },
    { label: "4〜8時間", max: 8 },
    { label: "8〜24時間", max: 24 },
    { label: "1日以上", max: Infinity },
  ];
  const bucketCounts = HOUR_BUCKETS.map(() => 0);
  for (const g of completed) {
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="p-6 md:p-8 w-full">
        <PageHeader
          title="マイゴール"
          desc={`${meName ? meName + " さんが" : "あなたが"}担当するゴールと進捗です。ほかのメンバーの進捗は「メンバー進捗」で確認できます。`}
        />
        <TreeAutoRefresh />

        {/* 上段：完了件数の推移（左）＋ 右クラスタ（期日・ステータス・実績時間） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 完了件数の推移 ＋ 進捗率 */}
          <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <CompletionChart completions={completions} />
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium dark:text-slate-300">進捗率</span>
                <span className="text-sm tabular-nums text-ink-muted dark:text-slate-400">
                  {overall}%
                </span>
              </div>
              <ProgressBar value={overall} />
            </div>
          </div>

          {/*
            右クラスタ:
              1列目=進行中/停滞、2列目=完了/未着手、3列目=実績時間ドーナツ。
              今月期限・翌月以降は 進行中・完了 の「上」に、同じ横幅で配置。
              ドーナツは 完了・未着手 の右側に縦2行ぶんで配置。
          */}
          <div className="grid grid-cols-[1fr_1fr_1.3fr] grid-rows-[auto_1fr_1fr] gap-4">
            {/* 期日タイル（進行中・完了の上・同じ横幅・縦幅は据え置き） */}
            <DueTile label="今月期限" value={dueThisMonth} className="col-start-1 row-start-1" />
            <DueTile label="翌月以降" value={dueLater} className="col-start-2 row-start-1" />

            {/* ステータス4枠 */}
            <StatusCard status={GOAL_STATUS.inProgress} count={countOf(GOAL_STATUS.inProgress)} className="col-start-1 row-start-2" />
            <StatusCard status={GOAL_STATUS.done} count={countOf(GOAL_STATUS.done)} className="col-start-2 row-start-2" />
            <StatusCard status={GOAL_STATUS.blocked} count={countOf(GOAL_STATUS.blocked)} className="col-start-1 row-start-3" />
            <StatusCard status={GOAL_STATUS.notStarted} count={countOf(GOAL_STATUS.notStarted)} className="col-start-2 row-start-3" />

            {/* 実績時間ドーナツ（完了・未着手の右・縦2行ぶん） */}
            <div className="col-start-3 row-start-2 row-span-2 self-start aspect-square rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 flex flex-col justify-center overflow-hidden">
              <TimeDonut slices={timeSlices} title="リードタイム（作成→完了）の割合" vertical />
            </div>
          </div>
        </div>

        {/* 詳しいタスク */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-semibold dark:text-white">タスク一覧</h2>
          <NewGoalForm goals={visibleGoals} />
        </div>

        <div className="mt-3 rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {tree.length === 0 ? (
            <div className="p-8 text-center text-ink-muted dark:text-slate-400">
              あなたが担当するゴールはまだありません。「＋ 新しいゴールを置く」から作成するか、管理者に担当の割り当てを依頼してください。
            </div>
          ) : (
            <GoalTree nodes={tree} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  status,
  count,
  className = "",
}: {
  status: GoalStatus;
  count: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 flex flex-col items-center justify-center text-center ${className}`}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-ink-muted dark:text-slate-400">
        <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
        {GOAL_STATUS_LABEL[status]}
      </div>
      <div className="text-4xl font-bold tabular-nums mt-1 text-ink dark:text-white">
        {count}
      </div>
    </div>
  );
}

function DueTile({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 ${className}`}
    >
      <span className="text-sm text-ink-muted dark:text-slate-400">{label}</span>
      <span className="text-2xl font-bold tabular-nums dark:text-white">
        {value}
        <span className="text-sm font-normal text-ink-muted ml-1">件</span>
      </span>
    </div>
  );
}

// 配下タスクの総数（全階層の子孫の数）。
function countDescendants(goalId: string, all: Goal[]): number {
  const kids = childrenOf(goalId, all);
  return kids.reduce((acc, k) => acc + 1 + countDescendants(k.id, all), 0);
}

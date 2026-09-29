import Link from "next/link";
import { listGoals, childrenOf, computeProgress, currentStep } from "@/lib/store";
import { exportSnapshot, readTeam, MemberSnapshot } from "@/lib/team";
import { memberConfig, syncEnabled } from "@/lib/config";
import { GOAL_STATUS, STEP_ACTOR_LABEL, Goal } from "@/lib/types";
import { StatusBadge, ProgressBar, PageHeader } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

// 連携メンバー同士で、お互いの進捗を見る。
// 共有フォルダ同期方式：各PCが書き出したスナップショットを読み合う。
export default async function TeamPage() {
  const myGoals = await listGoals();
  // 自分の最新を共有フォルダへ反映してから、全員分を読む。
  await exportSnapshot(myGoals);
  const enabled = syncEnabled();
  const me = memberConfig();

  const members: MemberSnapshot[] = enabled
    ? await readTeam()
    : [
        {
          memberId: me.id,
          memberName: me.name,
          updatedAt: new Date().toISOString(),
          goals: myGoals,
        },
      ];

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <PageHeader
        title="メンバー"
        desc="連携しているメンバーの進捗を、お互いに確認できます。"
        right={enabled ? <SyncButton /> : undefined}
      />

      {!enabled && <SetupNotice />}

      <div className="space-y-6">
        {members.map((m) => (
          <MemberCard key={m.memberId} snap={m} isMe={m.memberId === me.id} />
        ))}
      </div>
    </div>
  );
}

function MemberCard({ snap, isMe }: { snap: MemberSnapshot; isMe: boolean }) {
  const goals = snap.goals;
  const roots = childrenOf(null, goals);
  const leaves = goals.filter((g) => childrenOf(g.id, goals).length === 0);
  const doneCount = leaves.filter((g) => g.status === GOAL_STATUS.done).length;
  const activeLeaves = leaves.filter((g) => g.status !== GOAL_STATUS.done);

  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold">
            {snap.memberName.slice(0, 1)}
          </span>
          <span className="font-semibold dark:text-white">
            {snap.memberName}
            {isMe && (
              <span className="ml-2 text-[10px] rounded px-1.5 py-0.5 bg-brand text-white align-middle">
                自分
              </span>
            )}
          </span>
        </div>
        <span className="text-xs text-ink-muted dark:text-slate-400">
          更新 {relTime(snap.updatedAt)} ・ 完了 {doneCount}/{leaves.length}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* 上位ゴールの進捗 */}
        <div className="space-y-2">
          {roots.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-slate-400">
              ゴールがありません。
            </p>
          ) : (
            roots.map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <span className="flex-1 min-w-0 truncate text-sm dark:text-slate-200">
                  {g.title}
                </span>
                <div className="w-28 hidden sm:block">
                  <ProgressBar value={computeProgress(g.id, goals)} />
                </div>
                <span className="text-xs tabular-nums text-ink-muted dark:text-slate-500 w-9 text-right">
                  {computeProgress(g.id, goals)}%
                </span>
              </div>
            ))
          )}
        </div>

        {/* いま動いているタスクと現在地 */}
        {activeLeaves.length > 0 && (
          <div>
            <div className="text-xs text-ink-muted dark:text-slate-500 mb-1">
              進行中のタスク
            </div>
            <ul className="space-y-1">
              {activeLeaves.slice(0, 6).map((t) => (
                <MemberTaskRow key={t.id} task={t} goals={goals} isMe={isMe} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberTaskRow({
  task,
  goals,
  isMe,
}: {
  task: Goal;
  goals: Goal[];
  isMe: boolean;
}) {
  const cur = currentStep(task);
  const label = (
    <div className="flex items-center gap-2 text-sm py-1">
      <span className="flex-1 min-w-0 truncate dark:text-slate-200">
        {task.title}
        {cur && (
          <span className="text-xs text-ink-muted dark:text-slate-500">
            {" "}
            ／ 現在地: {cur.title}（{STEP_ACTOR_LABEL[cur.actor]}）
          </span>
        )}
      </span>
      <span className="text-xs tabular-nums text-ink-muted dark:text-slate-500">
        {task.progress}%
      </span>
      <StatusBadge status={task.status} />
    </div>
  );
  // 自分のタスクは詳細へ、他メンバーのは読み取り専用表示（リンクしない）。
  return isMe ? (
    <li>
      <Link href={`/goals/${task.id}/status`} className="block hover:text-brand">
        {label}
      </Link>
    </li>
  ) : (
    <li>{label}</li>
  );
}

function SetupNotice() {
  return (
    <div className="mb-6 rounded-card border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 p-5 text-sm text-amber-900 dark:text-amber-200 space-y-2">
      <p className="font-semibold">チーム共有はまだ有効になっていません（単独動作中）。</p>
      <p>
        各PCの <code>.env</code> に以下を設定し、全員で同じ共有フォルダ（OneDrive等）を指すと、
        メンバー同士で進捗を見られるようになります。
      </p>
      <pre className="text-xs bg-white dark:bg-slate-950 rounded p-3 border border-amber-200 dark:border-amber-900 overflow-x-auto">
        {`MEMBER_ID=tanaka           # 人ごとに別の値
MEMBER_NAME=田中
TEAM_SYNC_DIR=C:\\Users\\you\\OneDrive\\共有\\shinchoku-team`}
      </pre>
      <p className="text-xs">
        ※ サーバーもAPI送信も不要。共有フォルダの同期（OneDrive等）でお互いのスナップショットを読み合います。
      </p>
    </div>
  );
}

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.round(hr / 24)}日前`;
}

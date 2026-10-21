import {
  listGoals,
  childrenOf,
  computeProgress,
  estimateHours,
} from "@/lib/store";
import { listUsers } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/session";
import { GOAL_STATUS, type Goal } from "@/lib/types";
import { ProgressBar, PageHeader } from "@/components/ui";
import { GoalTree, type TreeNode } from "@/components/GoalTree";

export const dynamic = "force-dynamic";

// メンバー進捗：登録済みメンバー全員（自分を含む）のゴール進捗を表示する。
// ゴールの担当者(assignee)＝アカウントの表示名(氏 名) で紐づける。
export default async function TeamPage() {
  const me = await getCurrentUser();
  const [users, goals] = await Promise.all([listUsers(), listGoals()]);

  // 承認済みメンバー全員（自分を先頭に）。
  const members = users
    .filter((u) => u.status === "approved")
    .sort((a, b) => {
      if (a.id === me?.id) return -1;
      if (b.id === me?.id) return 1;
      return a.displayName.localeCompare(b.displayName, "ja");
    });

  // 担当ゴール（末端優先でそのメンバーが担当のもの）。
  // 「今日のToDo専用(todoOnly)」はメンバー進捗にも出さない。
  function goalsOf(displayName: string): Goal[] {
    return goals.filter(
      (g) => g.assignee && g.assignee === displayName && !g.todoOnly,
    );
  }

  const byId = new Map(goals.map((g) => [g.id, g] as const));
  // そのメンバーの担当のうち、祖先に同メンバー担当がない＝メイン（最上位）ゴール。
  function mainGoalsOf(assigned: Goal[]): Goal[] {
    const ids = new Set(assigned.map((g) => g.id));
    return assigned.filter((g) => {
      let pid = g.parentId;
      while (pid) {
        if (ids.has(pid)) return false; // 上位に自分担当がある→子ゴール扱い
        const p = byId.get(pid);
        if (!p) break;
        pid = p.parentId;
      }
      return true;
    });
  }

  // 「すべてのゴール」セクション用に、担当に関係なく全ゴールをツリー化する。
  function countDescendants(goalId: string): number {
    const kids = childrenOf(goalId, goals);
    return kids.reduce((acc, k) => acc + 1 + countDescendants(k.id), 0);
  }
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
      descCount: countDescendants(g.id),
      estimatedHours: estimateHours(g.id, goals),
      isActive: false,
      commentCount: comments.length,
      lastCommentAt,
      children: childrenOf(g.id, goals).map(buildNode),
    };
  };
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <PageHeader
        title="メンバー進捗"
        desc="登録済みメンバー全員（自分を含む）のゴールと進捗率を表示します。"
      />

      {members.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 p-10 text-center text-ink-muted">
          メンバーがまだいません（承認後にここへ表示されます）。
        </div>
      ) : (
        <div className="space-y-6">
          {members.map((u) => {
            const assigned = goalsOf(u.displayName);
            // メンバーのメインゴールを「すべてのゴール」と同じツリー表示で描画する。
            const memberTree: TreeNode[] = mainGoalsOf(assigned).map(buildNode);
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
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.avatar}
                        alt={u.displayName}
                        className="h-9 w-9 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-sm font-bold text-ink-soft">
                        {u.displayName.slice(0, 1)}
                      </span>
                    )}
                    <div>
                      <div className="font-bold text-ink">
                        {u.displayName}
                        {u.id === me?.id && (
                          <span className="ml-1 text-xs font-normal text-ink-muted">
                            （あなた）
                          </span>
                        )}
                      </div>
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

                {memberTree.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    担当ゴールはありません。
                  </p>
                ) : (
                  <div className="mt-3 rounded-card border border-slate-200 bg-white divide-y divide-slate-100">
                    <GoalTree nodes={memberTree} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

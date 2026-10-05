"use client";

import { useEffect, useState } from "react";
import { Goal } from "@/lib/types";
import { StatusBadge, ProgressBar } from "@/components/ui";

interface MemberSnapshot {
  memberId: string;
  memberName: string;
  updatedAt: string;
  goals: Goal[];
}

interface TeamResponse {
  syncEnabled: boolean;
  me: { id: string; name: string };
  members: MemberSnapshot[];
}

// ── 純粋関数（fsを含む store.ts を client から使えないため再実装） ──
function childrenOf(parentId: string | null, all: Goal[]): Goal[] {
  return all.filter((g) => g.parentId === parentId);
}
function computeProgress(goalId: string, all: Goal[]): number {
  const kids = all.filter((g) => g.parentId === goalId);
  if (kids.length === 0) {
    const self = all.find((g) => g.id === goalId);
    return self ? self.progress : 0;
  }
  const sum = kids.reduce((acc, c) => acc + computeProgress(c.id, all), 0);
  return Math.round(sum / kids.length);
}

/**
 * サイドバーの「メンバー」から開くフライアウト。
 * 連携メンバーを名前で一覧し、名前クリックでそのメンバーのタスク詳細・進捗を
 * （ページ遷移せず）アコーディオンで展開表示する。読み取り専用。
 */
export function MembersFlyout({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/team");
        if (!active) return;
        if (!res.ok) {
          setError("メンバー情報の取得に失敗しました");
          return;
        }
        setData(await res.json());
      } catch {
        if (active) setError("メンバー情報の取得に失敗しました");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 自分以外の連携メンバー。
  const others =
    data?.members.filter((m) => m.memberId !== data.me.id) ?? [];

  return (
    <>
      {/* 外側クリックで閉じる */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-full top-0 ml-2 z-40 w-96 max-h-[85vh] overflow-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold dark:text-white text-sm">連携メンバー</h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-lg leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="p-2">
          {error ? (
            <p className="text-sm text-red-600 p-3">{error}</p>
          ) : !data ? (
            <p className="text-sm text-ink-muted p-3">読み込み中…</p>
          ) : !data.syncEnabled ? (
            <p className="text-sm text-ink-muted dark:text-slate-400 p-3">
              チーム連携が未設定です。`.env` に <code>TEAM_SYNC_DIR</code> を設定すると
              メンバーが表示されます。
            </p>
          ) : others.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-slate-400 p-3">
              連携メンバーがまだいません。
            </p>
          ) : (
            <ul className="space-y-1">
              {others.map((m) => {
                const open = openId === m.memberId;
                const roots = childrenOf(null, m.goals);
                const overall =
                  roots.length === 0
                    ? 0
                    : Math.round(
                        roots.reduce(
                          (acc, r) => acc + computeProgress(r.id, m.goals),
                          0,
                        ) / roots.length,
                      );
                return (
                  <li key={m.memberId}>
                    <button
                      onClick={() =>
                        setOpenId(open ? null : m.memberId)
                      }
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left"
                    >
                      <span
                        className={`text-ink-muted text-xs transition-transform ${open ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium dark:text-slate-200">
                        {m.memberName}
                      </span>
                      <span className="text-xs tabular-nums text-ink-muted dark:text-slate-400">
                        {overall}%
                      </span>
                    </button>

                    {open && (
                      <div className="mt-1 mb-2 ml-2 rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                        {roots.length === 0 ? (
                          <p className="text-xs text-ink-muted dark:text-slate-400 p-3">
                            タスクがありません。
                          </p>
                        ) : (
                          roots.map((g) => (
                            <MemberTreeRow
                              key={g.id}
                              goal={g}
                              all={m.goals}
                              depth={0}
                            />
                          ))
                        )}
                        <p className="text-[11px] text-ink-muted dark:text-slate-500 px-3 py-1.5">
                          最終同期: {m.updatedAt.slice(0, 16).replace("T", " ")}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* メンバーを招待（社内PC連携） */}
        {data?.syncEnabled && <InviteSection />}
      </div>
    </>
  );
}

// 招待キー／参加コマンドを発行して見せる。参加側は `npm run join` に貼るだけ。
function InviteSection() {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<{ key: string; command: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setOpen(true);
    if (invite) return;
    const res = await fetch("/api/team/invite");
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "招待キーの発行に失敗しました");
      return;
    }
    setInvite(d);
  }

  async function copy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 p-3">
      {!open ? (
        <button
          onClick={load}
          className="text-sm text-brand font-medium hover:underline"
        >
          ＋ メンバーを招待（社内PC連携）
        </button>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : !invite ? (
        <p className="text-xs text-ink-muted">発行中…</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted dark:text-slate-400">
            参加するPCで、プロジェクト直下から次を実行してください（名前は書き換え）。
          </p>
          <pre className="text-[11px] whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-950 rounded-lg p-2 border border-slate-200 dark:border-slate-800 dark:text-slate-200">
            {invite.command}
          </pre>
          <button
            onClick={copy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white"
          >
            {copied ? "コピーしました" : "コマンドをコピー"}
          </button>
        </div>
      )}
    </div>
  );
}

// ゴールツリーページと同じレイアウトの読み取り専用行。
function MemberTreeRow({
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
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
      >
        <span className="text-ink-muted dark:text-slate-500 text-xs">
          {kids.length > 0 ? "▶" : "•"}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm dark:text-slate-200">
          {goal.title}
        </span>
        <span className="text-xs text-ink-muted dark:text-slate-500 tabular-nums w-9 text-right">
          {progress}%
        </span>
        <StatusBadge status={goal.status} />
      </div>
      {depth === 0 && kids.length > 0 && (
        <div className="px-3 pb-1" style={{ paddingLeft: `${12}px` }}>
          <ProgressBar value={progress} />
        </div>
      )}
      {kids.map((k) => (
        <MemberTreeRow key={k.id} goal={k} all={all} depth={depth + 1} />
      ))}
    </>
  );
}

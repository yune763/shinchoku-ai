"use client";

import { useEffect, useState } from "react";

interface Log {
  kind: string;
  author: string;
  body: string;
  createdAt: string;
}
interface Review {
  summary: string;
  reviewer: string;
  reviewedAt: string;
}
interface Goal {
  id: string;
  title: string;
  status: string;
  completionCriteria: string;
  review?: Review | null;
  logs: Log[];
  createdAt: string;
  updatedAt: string;
}

const AI_RESULT = "ai_result";
const DONE = "done";

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "不明";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr > 0 ? `${d}日${hr}時間` : `${d}日`;
}

// 子ゴールの「実装内容・完了理由」をMSGBOX（モーダル）で確認する。
// 実装ログ（Claude Code 実行結果／再実装）と完了レビューを新しい順に表示する。
export function GoalReviewModal({
  goalId,
  title,
  onClose,
}: {
  goalId: string;
  title: string;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/goals/${goalId}`);
        const d = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(d.error ?? "読み込みに失敗しました");
          return;
        }
        setGoal(d.goal ?? d);
      } catch {
        if (active) setError("サーバーに接続できません");
      }
    })();
    return () => {
      active = false;
    };
  }, [goalId]);

  const aiLogs = (goal?.logs ?? [])
    .filter((l) => l.kind === AI_RESULT)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="font-semibold dark:text-white truncate">{title}</h2>
            <p className="text-xs text-ink-muted dark:text-slate-400">
              実装内容と完了理由（レビュー）
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-xl leading-none shrink-0"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !goal ? (
            <p className="text-sm text-ink-muted">読み込み中…</p>
          ) : (
            <>
              {/* リードタイム（完了ゴールのみ：作成→完了の経過） */}
              {goal.status === DONE && (
                <section className="text-sm">
                  <span className="text-ink-muted dark:text-slate-400">
                    リードタイム（作成→完了）：
                  </span>
                  <span className="font-medium dark:text-slate-200">
                    {formatDuration(
                      Date.parse(goal.updatedAt) - Date.parse(goal.createdAt),
                    )}
                  </span>
                  <span className="text-xs text-ink-muted ml-2">
                    （{goal.createdAt.slice(0, 10)} → {goal.updatedAt.slice(0, 10)}）
                  </span>
                </section>
              )}

              {/* 完了の基準 */}
              {goal.completionCriteria?.trim() && (
                <section>
                  <h3 className="text-xs font-semibold text-ink-muted dark:text-slate-400 mb-1">
                    完了の基準
                  </h3>
                  <p className="text-sm whitespace-pre-wrap dark:text-slate-200 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    {goal.completionCriteria}
                  </p>
                </section>
              )}

              {/* 完了レビュー（なぜ完了にしたか） */}
              {goal.review?.summary?.trim() && (
                <section>
                  <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                    完了レビュー（{goal.review.reviewer} ・{" "}
                    {goal.review.reviewedAt.slice(0, 10)}）
                  </h3>
                  <p className="text-sm whitespace-pre-wrap dark:text-slate-200 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3">
                    {goal.review.summary}
                  </p>
                </section>
              )}

              {/* 実装内容（AI実行結果ログ） */}
              <section>
                <h3 className="text-xs font-semibold text-ink-muted dark:text-slate-400 mb-1">
                  実装内容（実行結果の記録・新しい順）
                </h3>
                {aiLogs.length === 0 ? (
                  <p className="text-sm text-ink-muted dark:text-slate-400">
                    まだ実装の記録はありません。「Claude Codeで実装」を実行すると、結果がここに表示されます。
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {aiLogs.map((l, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 p-3"
                      >
                        <div className="text-[11px] text-ink-muted dark:text-slate-500 mb-1">
                          {l.createdAt.slice(0, 16).replace("T", " ")} ・ {l.author}
                        </div>
                        <div className="text-sm whitespace-pre-wrap dark:text-slate-200">
                          {l.body}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

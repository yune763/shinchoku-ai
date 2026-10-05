"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui";
import { TaskRowMenu } from "@/components/TaskRowMenu";
import { GoalReviewModal } from "@/components/GoalReviewModal";
import { CommentModal, commentReadKey } from "@/components/GoalModals";
import { GOAL_STATUS, GOAL_STATUS_LABEL, GoalStatus } from "@/lib/types";

// サーバー側で算出済みのツリーノード（関数を含まない素のデータ）。
export interface TreeNode {
  id: string;
  title: string;
  status: GoalStatus;
  dueDate: string | null;
  assignee: string;
  progress: number;
  descCount: number; // 配下タスク総数（全階層）
  estimatedHours: number;
  isActive: boolean;
  commentCount: number; // コメント（人間）の件数
  lastCommentAt: string | null; // 最新コメントの時刻（未読判定用）
  children: TreeNode[];
}

// 工数マークの配色（現在地＝ステータスが色で分かる）。
const STATUS_MARK: Record<GoalStatus, string> = {
  [GOAL_STATUS.inProgress]: "bg-indigo-500 text-white",
  [GOAL_STATUS.done]: "bg-emerald-500 text-white",
  [GOAL_STATUS.blocked]: "bg-amber-500 text-white",
  [GOAL_STATUS.notStarted]:
    "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

// 子ゴールを親ゴールに収納（折りたたみ）できるツリー。開閉状態は各行で保持する。
export function GoalTree({ nodes }: { nodes: TreeNode[] }) {
  return (
    <>
      {nodes.map((n) => (
        <Row key={n.id} node={n} depth={0} />
      ))}
    </>
  );
}

function Row({ node, depth }: { node: TreeNode; depth: number }) {
  // 既定は収納（非表示）。開閉状態はReactのstateに保持されるため、URLを開いたままの
  // 自動更新(router.refresh)では最後の状態が維持され、URLを開き直す（リロード）と
  // state がリセットされて非表示スタートに戻る。
  const [open, setOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [unread, setUnread] = useState(false);
  const hasKids = node.children.length > 0;

  // 未読コメント判定：最新コメント時刻 > ローカル保存の最終閲覧時刻 なら未読。
  useEffect(() => {
    if (!node.lastCommentAt) {
      setUnread(false);
      return;
    }
    let lastRead = "";
    try {
      lastRead = localStorage.getItem(commentReadKey(node.id)) ?? "";
    } catch {
      /* noop */
    }
    setUnread(node.lastCommentAt > lastRead);
  }, [node.id, node.lastCommentAt, showComment]);

  return (
    <>
      <div
        className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
      >
        {/* 収納トグル（子があるときだけ）。無い行は幅だけ合わせる。 */}
        {hasKids ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "子ゴールを収納" : "子ゴールを展開"}
            aria-expanded={open}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-ink-muted dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M8 5l8 7-8 7z" />
            </svg>
          </button>
        ) : (
          <span className="shrink-0 w-5" />
        )}

        {/* 工数マーク。色でステータス＝現在地が分かる。作業中はリング表示。 */}
        <span
          title={
            hasKids
              ? `${GOAL_STATUS_LABEL[node.status]} ・ 配下タスク ${node.descCount}件${node.isActive ? " ・ 作業中" : ""}`
              : `${GOAL_STATUS_LABEL[node.status]}（末端タスク）${node.estimatedHours > 0 ? ` ・ 推定 ${node.estimatedHours}h` : ""}${node.isActive ? " ・ 作業中" : ""}`
          }
          className={[
            "shrink-0 inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 text-xs font-semibold tabular-nums",
            hasKids ? "rounded-full" : "rounded-md",
            STATUS_MARK[node.status],
            node.isActive
              ? "ring-2 ring-brand ring-offset-1 dark:ring-offset-slate-900"
              : "",
          ].join(" ")}
        >
          {hasKids ? node.descCount : "-"}
        </span>

        {/* タイトルは詳細ページへは飛ばさない（レビューはメモアイコンで確認）。 */}
        <span className="flex-1 min-w-0 truncate dark:text-slate-200">
          {node.title}
        </span>
        <span className="text-xs text-ink-muted dark:text-slate-500 tabular-nums w-16 text-right hidden sm:inline">
          {node.dueDate || "—"}
        </span>
        <span className="text-xs text-ink-muted dark:text-slate-500 tabular-nums hidden sm:inline">
          {node.assignee || "—"}
        </span>
        <span className="text-xs text-ink-muted dark:text-slate-500 tabular-nums w-10 text-right">
          {node.progress}%
        </span>
        <StatusBadge status={node.status} />
        <TaskRowMenu goalId={node.id} title={node.title} isRoot={depth === 0} />
        {/* 実装内容・完了理由のレビューを確認するメモアイコン（3点リーダーとコメントの間） */}
        <button
          onClick={() => setShowReview(true)}
          aria-label="実装内容・レビューを見る"
          title="実装内容・レビューを見る"
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-ink-muted dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8M8 17h5" />
          </svg>
        </button>
        {/* コメント（人間）アイコン：最上位（最終目標）ゴールのみ。未読があれば件数バッジを表示。 */}
        {depth === 0 && (
          <button
            onClick={() => setShowComment(true)}
            aria-label="コメント"
            title="実装に関するコメント"
            className="relative w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-ink-muted dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
            </svg>
            {unread && node.commentCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                {node.commentCount}
              </span>
            )}
          </button>
        )}
      </div>

      {showReview && (
        <GoalReviewModal
          goalId={node.id}
          title={node.title}
          onClose={() => setShowReview(false)}
        />
      )}
      {showComment && (
        <CommentModal
          goalId={node.id}
          title={node.title}
          onClose={() => setShowComment(false)}
        />
      )}

      {hasKids &&
        open &&
        node.children.map((c) => (
          <Row key={c.id} node={c} depth={depth + 1} />
        ))}
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiRequestModal } from "@/components/AiRequestModal";
import { ClaudeRunModal } from "@/components/ClaudeRunModal";
import {
  EditModal,
  AddChildModal,
  AssigneeModal,
  DueDateModal,
  KpiModal,
  NotifyModal,
  DeleteModal,
  CommentModal,
  ApplyConsultModal,
} from "@/components/GoalModals";

// メニューのおおよその高さ（画面下端での開く方向の判定に使う）。
const MENU_HEIGHT = 470;

/**
 * ゴールツリーの各タスク行に置く縦3点メニュー。
 * AIに依頼する（Claude Code対話/Cursor実装/AI実装/指示文コピー）・AIに質問する・
 * 編集・追加・担当者・期日・KPI・コメント・通知・削除 を、すべてMSGBOXで操作する。
 */
export function TaskRowMenu({
  goalId,
  title,
  isRoot = false,
}: {
  goalId: string;
  title: string;
  isRoot?: boolean; // 最上位（最終目標）ゴールか。コメントは最上位のみ。
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 各MSGBOX / 実行の表示状態。
  const [modal, setModal] = useState<
    | null
    | "run"
    | "copy"
    | "consult"
    | "edit"
    | "add"
    | "assignee"
    | "due"
    | "kpi"
    | "comment"
    | "notify"
    | "delete"
  >(null);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < MENU_HEIGHT);
    }
    setOpen((v) => !v);
  }

  // 開発ツール（Claude Code CLI＝対話 / Cursor＝実装）を作業フォルダで開く。
  async function openTool(tool: "claude" | "cursor") {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goalId}/open-claude?tool=${tool}`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(d.error ?? "起動に失敗しました");
      } else if (tool === "cursor") {
        setNote("Cursor を開きました");
      } else {
        setNote(
          d.launched
            ? "Claude を開きました（指示文を入力済み）。送信して相談を始めてください"
            : "指示文をコピーしました（Claudeアプリが見つかりません）",
        );
      }
    } catch {
      setNote("サーバーに接続できません");
    }
    setBusy(false);
    setTimeout(() => setNote(null), 3000);
  }

  // AIに質問する：右下AIアシスタントをこのゴールを主題に開く。
  function askAi() {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("shinchoku:chat", { detail: { goalId, title } }),
    );
  }

  function openModal(m: typeof modal) {
    setOpen(false);
    setModal(m);
  }
  const closeModal = () => setModal(null);

  const item =
    "w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 dark:text-slate-200";

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label="操作メニュー"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-muted dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {note && (
        <div className="absolute right-0 top-8 z-40 whitespace-nowrap rounded-lg bg-ink text-white text-xs px-3 py-1.5 shadow-lg">
          {note}
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={[
              "absolute right-0 z-40 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-1.5",
              dropUp ? "bottom-8" : "top-8",
            ].join(" ")}
          >
            {/* AIに依頼する：ホバーで左側にフライアウト表示 */}
            <div className="relative group">
              <button className={`${item} flex items-center justify-between`}>
                <span>AIに依頼する</span>
                <span className="text-ink-muted">‹</span>
              </button>
              <div className="absolute right-full top-0 mr-0.5 hidden group-hover:block w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-1.5">
                <button onClick={() => openTool("claude")} disabled={busy} className={item}>
                  claude code で開く
                </button>
                <button onClick={() => openTool("cursor")} disabled={busy} className={item}>
                  cursor で開く
                </button>
                <button onClick={() => openModal("consult")} className={item}>
                  相談結果を反映する
                </button>
                <button onClick={() => openModal("run")} className={item}>
                  AI実装する
                </button>
                <button onClick={() => openModal("copy")} className={item}>
                  指示文をコピーする
                </button>
              </div>
            </div>

            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button onClick={askAi} className={item}>
              AIに質問する
            </button>
            <button onClick={() => openModal("edit")} className={item}>
              編集
            </button>
            <button onClick={() => openModal("add")} className={item}>
              追加
            </button>
            <button onClick={() => openModal("assignee")} className={item}>
              担当者・メンバー
            </button>
            <button onClick={() => openModal("due")} className={item}>
              期日を設定
            </button>
            <button onClick={() => openModal("kpi")} className={item}>
              KPIを設定
            </button>
            {isRoot && (
              <button onClick={() => openModal("comment")} className={item}>
                コメント
              </button>
            )}
            <button onClick={() => openModal("notify")} className={item}>
              通知
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button
              onClick={() => openModal("delete")}
              className="w-full text-left px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              ゴールを削除
            </button>
          </div>
        </>
      )}

      {modal === "run" && (
        <ClaudeRunModal goalId={goalId} onClose={() => { closeModal(); router.refresh(); }} />
      )}
      {modal === "copy" && <AiRequestModal goalId={goalId} onClose={closeModal} />}
      {modal === "consult" && (
        <ApplyConsultModal goalId={goalId} title={title} onClose={closeModal} />
      )}
      {modal === "edit" && <EditModal goalId={goalId} onClose={closeModal} />}
      {modal === "add" && (
        <AddChildModal goalId={goalId} parentTitle={title} onClose={closeModal} />
      )}
      {modal === "assignee" && <AssigneeModal goalId={goalId} onClose={closeModal} />}
      {modal === "due" && <DueDateModal goalId={goalId} onClose={closeModal} />}
      {modal === "kpi" && <KpiModal goalId={goalId} onClose={closeModal} />}
      {modal === "comment" && (
        <CommentModal goalId={goalId} title={title} onClose={closeModal} />
      )}
      {modal === "notify" && <NotifyModal goalId={goalId} onClose={closeModal} />}
      {modal === "delete" && (
        <DeleteModal goalId={goalId} title={title} onClose={closeModal} />
      )}
    </div>
  );
}

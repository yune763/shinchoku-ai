"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
}

/**
 * アプリ内AIアシスタント。右下のボタンから開き、進捗の確認や簡単な修正を会話で行う。
 * バックエンドは claude CLI（Max定額）。修正が実行されたら画面を再取得して反映する。
 */
export function ChatPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [focus, setFocus] = useState<{ goalId: string; title: string } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // タスク行の吹き出しから「このタスクについて話す」イベントを受け取る。
  useEffect(() => {
    function onChat(e: Event) {
      const detail = (e as CustomEvent).detail as {
        goalId: string;
        title: string;
      };
      if (!detail?.goalId) return;
      setFocus(detail);
      setOpen(true);
    }
    window.addEventListener("shinchoku:chat", onChat as EventListener);
    return () =>
      window.removeEventListener("shinchoku:chat", onChat as EventListener);
  }, []);

  // 新着・開いた直後とも、常に最新の会話（最下部）が見えるようにする。
  useEffect(() => {
    if (!open) return;
    // 開いた直後はDOM描画後にスクロールさせる。
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [msgs, busy, open, focus]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          focusGoalId: focus?.goalId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", content: `エラー: ${data.error ?? "応答に失敗しました"}` },
        ]);
      } else {
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", content: data.reply, actions: data.actions },
        ]);
        // 修正が実行されたら画面へ反映。
        if (Array.isArray(data.actions) && data.actions.length > 0) {
          router.refresh();
        }
      }
    } catch {
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", content: "エラー: サーバーに接続できません" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 右下の起動ボタン */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="AIアシスタントを開く"
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-brand text-white shadow-xl flex items-center justify-center hover:opacity-90"
        >
          {/* AIアシスタントはスパークル（キラキラ）アイコンで、コメント吹き出しと区別する */}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
            <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
          </svg>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(92vw,380px)] h-[min(80vh,560px)] flex flex-col rounded-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="font-semibold text-sm dark:text-white">AIアシスタント</h2>
              <p className="text-[11px] text-ink-muted dark:text-slate-400">
                進捗の確認・修正・実装の起動ができます
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink text-xl leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>

          {focus && (
            <div className="flex items-center gap-2 px-3 py-2 bg-brand-bg dark:bg-indigo-950/40 border-b border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-ink-muted dark:text-slate-400 shrink-0">
                対象タスク:
              </span>
              <span className="flex-1 min-w-0 truncate text-xs font-medium text-brand-fg dark:text-indigo-300">
                {focus.title}
              </span>
              <button
                onClick={() => setFocus(null)}
                className="text-ink-muted hover:text-ink text-sm leading-none shrink-0"
                aria-label="対象タスクを解除"
                title="対象タスクを解除"
              >
                ×
              </button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
            {msgs.length === 0 && (
              <p className="text-xs text-ink-muted dark:text-slate-400">
                例：「進行中のタスクは？」「〇〇を完了にして」「提案書ゴールの期日を来週金曜に」「この子ゴールを実装して」
              </p>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <div
                  className={[
                    "inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-brand text-white"
                      : "bg-slate-100 dark:bg-slate-800 dark:text-slate-100",
                  ].join(" ")}
                >
                  {m.content}
                </div>
                {m.actions && m.actions.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {m.actions.map((a, j) => (
                      <li
                        key={j}
                        className="text-[11px] text-emerald-700 dark:text-emerald-400"
                      >
                        ✓ {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-xs text-ink-muted dark:text-slate-400">
                考え中…（数秒〜十数秒かかることがあります）
              </p>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="メッセージ（Enterで送信 / Shift+Enterで改行）"
                className="flex-1 resize-none rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

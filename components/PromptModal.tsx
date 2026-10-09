"use client";

import { useState } from "react";

// 相談文などのテキストを表示し、コピーできるモーダル。
// 環境(Claudeデスクトップの有無/OS)に関係なく確実にコピーできる出口。
export function PromptModal({
  title = "相談文",
  note,
  prompt,
  onClose,
}: {
  title?: string;
  note?: string;
  prompt: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 失敗時は手動選択でコピー */
    }
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 className="font-semibold dark:text-white">{title}</h2>
            {note && (
              <p className="text-xs text-ink-muted dark:text-slate-400">{note}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="text-xl leading-none text-ink-muted hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-xs font-mono dark:text-slate-200">
            {prompt}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-muted"
          >
            閉じる
          </button>
          <button
            onClick={copy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            {copied ? "コピーしました" : "相談文をコピー"}
          </button>
        </div>
      </div>
    </div>
  );
}

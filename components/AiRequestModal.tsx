"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ゴールの文脈から生成された指示文を表示し、コピーできるモーダル。
 * 「Claude Code / Codex にそのまま貼って、続きから作業させる」ための出口。
 */
export function AiRequestModal({
  goalId,
  onClose,
}: {
  goalId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/goals/${goalId}/prompt`);
      if (!active) return;
      if (!res.ok) {
        setError("指示文の生成に失敗しました");
        return;
      }
      const data = await res.json();
      setPrompt(data.prompt);
      // 依頼を発行した記録をログに残す
      fetch(`/api/goals/${goalId}/prompt`, { method: "POST" }).then(() =>
        router.refresh(),
      );
    })();
    return () => {
      active = false;
    };
  }, [goalId, router]);

  async function copy() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-semibold dark:text-white">AIに依頼する</h2>
            <p className="text-xs text-ink-muted dark:text-slate-400">
              この指示文をコピーして、Claude Code / Codex などに貼るだけ。
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : prompt === null ? (
            <p className="text-sm text-ink-muted">生成中…</p>
          ) : (
            <pre className="text-xs whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-950 rounded-lg p-4 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
              {prompt}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-muted"
          >
            閉じる
          </button>
          <button
            onClick={copy}
            disabled={!prompt}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {copied ? "コピーしました" : "指示文をコピー"}
          </button>
        </div>
      </div>
    </div>
  );
}

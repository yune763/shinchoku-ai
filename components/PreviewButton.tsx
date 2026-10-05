"use client";

import { useEffect, useRef, useState } from "react";

interface Preview {
  status: "starting" | "ready" | "stopped" | "error";
  url: string;
  error: string | null;
}

const POLL_MS = 2000;

/**
 * 実装物（Webアプリ）を repoPath で起動し、準備できたらブラウザで開くボタン。
 */
export function PreviewButton({ goalId }: { goalId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedFor = useRef<string | null>(null);

  async function poll() {
    try {
      const res = await fetch(`/api/goals/${goalId}/preview`);
      const data = await res.json();
      setPreview(data.preview);
      if (data.preview?.status === "starting") {
        timer.current = setTimeout(poll, POLL_MS);
      } else if (data.preview?.status === "ready") {
        // 準備できたら一度だけ自動で開く。
        if (openedFor.current !== data.preview.url) {
          openedFor.current = data.preview.url;
          window.open(data.preview.url, "_blank", "noopener");
        }
      }
    } catch {
      /* 次回に委ねる */
    }
  }

  useEffect(() => {
    // 既に起動済みかを初回確認。
    poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);

  async function start() {
    setBusy(true);
    setError(null);
    openedFor.current = null;
    try {
      const res = await fetch(`/api/goals/${goalId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "起動に失敗しました");
      } else {
        setPreview(data.preview);
        poll();
      }
    } catch {
      setError("サーバーに接続できません");
    }
    setBusy(false);
  }

  async function stop() {
    setBusy(true);
    await fetch(`/api/goals/${goalId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    }).catch(() => {});
    openedFor.current = null;
    await poll();
    setBusy(false);
  }

  const status = preview?.status;
  const running = status === "starting" || status === "ready";

  return (
    <div className="flex flex-col items-stretch gap-1">
      {running ? (
        <>
          {status === "ready" ? (
            <a
              href={preview!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium text-center hover:opacity-90"
            >
              ブラウザで開く
            </a>
          ) : (
            <span className="rounded-lg bg-amber-100 text-amber-800 px-4 py-2 text-sm font-medium text-center">
              起動中…
            </span>
          )}
          <button
            onClick={stop}
            disabled={busy}
            className="text-xs text-ink-muted hover:text-red-600"
          >
            プレビューを停止
          </button>
        </>
      ) : (
        <button
          onClick={start}
          disabled={busy}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-50 dark:text-slate-200"
        >
          {busy ? "起動中…" : "ブラウザでプレビュー"}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

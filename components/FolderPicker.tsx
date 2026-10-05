"use client";

import { useEffect, useState } from "react";

interface FsResp {
  path: string;
  parent: string | null;
  home: string;
  dirs: { name: string; path: string }[];
  error?: string;
}

/**
 * サーバー(このPC)のフォルダを辿って選ぶモーダル。作業フォルダの指定に使う。
 */
export function FolderPicker({
  initialPath,
  onSelect,
  onClose,
}: {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<FsResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(p?: string) {
    setError(null);
    try {
      const q = p ? `?path=${encodeURIComponent(p)}` : "";
      const res = await fetch(`/api/fs${q}`);
      const d = (await res.json()) as FsResp;
      if (!res.ok) {
        setError(d.error ?? "フォルダを開けません");
        return;
      }
      setData(d);
    } catch {
      setError("フォルダ一覧の取得に失敗しました");
    }
  }

  useEffect(() => {
    load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-sm dark:text-white">作業フォルダを選択</h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs">
          <button
            onClick={() => data?.parent && load(data.parent)}
            disabled={!data?.parent}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 disabled:opacity-40 dark:text-slate-300"
          >
            ↑ 上へ
          </button>
          <button
            onClick={() => data && load(data.home)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 dark:text-slate-300"
          >
            ホーム
          </button>
          <span className="flex-1 min-w-0 truncate text-ink-muted dark:text-slate-400">
            {data?.path ?? ""}
          </span>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {error ? (
            <p className="text-sm text-red-600 p-3">{error}</p>
          ) : !data ? (
            <p className="text-sm text-ink-muted p-3">読み込み中…</p>
          ) : data.dirs.length === 0 ? (
            <p className="text-sm text-ink-muted p-3">サブフォルダはありません。</p>
          ) : (
            <ul>
              {data.dirs.map((d) => (
                <li key={d.path}>
                  <button
                    onClick={() => load(d.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-200"
                  >
                    <span>📁</span>
                    <span className="truncate">{d.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-muted"
          >
            キャンセル
          </button>
          <button
            onClick={() => data && onSelect(data.path)}
            disabled={!data}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            このフォルダを選択
          </button>
        </div>
      </div>
    </div>
  );
}

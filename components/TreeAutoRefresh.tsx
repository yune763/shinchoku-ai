"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Target {
  goalId: string;
  title: string;
}

/**
 * Claude Code の実行中だけ、ゴールツリー/詳細を定期的に再取得して進捗を反映する。
 * さらに「実行中の対象ゴール」をバナー表示して、作業が進んでいることを見える化する。
 * アイドル時も軽量エンドポイントを覗くだけなので負荷は小さい。
 */
export function TreeAutoRefresh({ intervalMs = 1500 }: { intervalMs?: number }) {
  const router = useRouter();
  const wasRunning = useRef(false);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/runs");
        const data = await res.json();
        if (!active) return;
        setTargets(Array.isArray(data.targets) ? data.targets : []);
        if (data.running) {
          wasRunning.current = true;
          router.refresh();
        } else if (wasRunning.current) {
          wasRunning.current = false;
          router.refresh(); // 実行完了直後の最終反映
        }
      } catch {
        // 一時的な失敗は次のtickで回復させる。
      }
      if (active) timer = setTimeout(tick, intervalMs);
    }

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [router, intervalMs]);

  if (targets.length === 0) return null;

  return (
    <div className="mb-4 rounded-card border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        実行中（Claude Codeが作業しています）
      </div>
      <ul className="mt-1 space-y-0.5">
        {targets.map((t) => (
          <li
            key={t.goalId}
            className="text-xs text-indigo-700/90 dark:text-indigo-300/90 truncate"
          >
            ・{t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

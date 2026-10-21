"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// アプリが開いている間、定期的に作業ログ同期を叩く。
// Claude Code の Stop フックに依存せず、Cursor 等で作業しても進捗が自動反映される。
// 取り込みがあったらページを再取得して反映する。
const SYNC_INTERVAL_MS = 120_000; // 2分ごと

export function WorklogAutoSync() {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    let active = true;

    async function sync() {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch("/api/worklog/sync", { method: "POST" });
        const d = await res.json().catch(() => ({}));
        if (active && Array.isArray(d.synced) && d.synced.length > 0) {
          router.refresh();
        }
      } catch {
        /* 次の周期で再試行 */
      } finally {
        busy.current = false;
      }
    }

    sync(); // 開いた直後に1回
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    // ウィンドウに戻ってきた時も更新（作業から切り替えた直後に反映されやすく）。
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}

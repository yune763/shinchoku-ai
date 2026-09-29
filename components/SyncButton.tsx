"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 自分の進捗を今すぐ共有フォルダへ反映し、最新を読み直す。
export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function sync() {
    setBusy(true);
    await fetch("/api/team", { method: "POST" }).catch(() => {});
    setBusy(false);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
    router.refresh();
  }

  return (
    <button
      onClick={sync}
      disabled={busy}
      className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm hover:border-brand disabled:opacity-50 dark:text-slate-200"
    >
      {busy ? "同期中…" : done ? "同期しました" : "今すぐ同期"}
    </button>
  );
}

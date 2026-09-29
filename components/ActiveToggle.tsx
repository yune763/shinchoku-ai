"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// このゴールを「作業中」にする/解除する。作業中ゴールにはコミットが自動記録される。
export function ActiveToggle({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isActive = activeId === goalId;

  useEffect(() => {
    fetch("/api/active")
      .then((r) => r.json())
      .then((d) => setActiveId(d.activeGoalId))
      .catch(() => {});
  }, []);

  async function toggle() {
    setBusy(true);
    const next = isActive ? null : goalId;
    await fetch("/api/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeGoalId: next }),
    }).catch(() => {});
    setActiveId(next);
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={[
        "rounded-lg px-4 py-2 text-sm font-medium border disabled:opacity-50",
        isActive
          ? "bg-green-600 text-white border-green-600"
          : "border-slate-300 dark:border-slate-700 text-ink-soft dark:text-slate-300 hover:border-brand",
      ].join(" ")}
      title="作業中ゴールにはコミットが自動記録されます"
    >
      {isActive ? "作業中（コミット自動記録）" : "このゴールを作業中にする"}
    </button>
  );
}

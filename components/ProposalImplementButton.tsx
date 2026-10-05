"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 「この提案を実装する」ボタン。外部リンクではなく、進捗管理AIのAPIを叩いて
// 提案をゴールとして起票し、その詳細ページへ遷移する。
export function ProposalImplementButton({
  proposalId,
  existingGoalId,
}: {
  proposalId: string;
  existingGoalId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (existingGoalId) {
    return (
      <Link
        href={`/goals/${existingGoalId}`}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        ✓ 起票済み — ゴールを開く
      </Link>
    );
  }

  const onClick = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/proposals/implement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "起票に失敗しました");
      router.push(`/goals/${data.goalId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "起票に失敗しました");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-fg disabled:opacity-60"
      >
        {loading ? "起票中…" : "▶ この提案を実装する（ゴールに起票）"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

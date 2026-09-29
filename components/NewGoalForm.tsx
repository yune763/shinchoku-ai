"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Goal } from "@/lib/types";

export function NewGoalForm({
  goals,
  defaultParentId = null,
  compact = false,
  onCreated,
}: {
  goals: Goal[];
  defaultParentId?: string | null;
  compact?: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(compact ? false : true);
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(defaultParentId);
  const [desire, setDesire] = useState("");
  const [purpose, setPurpose] = useState("");
  const [completionCriteria, setCompletionCriteria] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("タイトルは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        parentId,
        desire,
        purpose,
        completionCriteria,
        assignee,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("保存に失敗しました");
      return;
    }
    setTitle("");
    setDesire("");
    setPurpose("");
    setCompletionCriteria("");
    setAssignee("");
    if (compact) setOpen(false);
    onCreated?.();
    router.refresh();
  }

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-brand font-medium hover:underline"
      >
        ＋ 子ゴール/ToDoを追加
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
    >
      <div className="text-sm font-semibold dark:text-white">
        {defaultParentId ? "子ゴール / ToDo を追加" : "新しいゴールを置く"}
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="ゴールのタイトル（例: 提案書の初稿を作る）"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
      />
      {!defaultParentId && (
        <select
          value={parentId ?? ""}
          onChange={(e) => setParentId(e.target.value || null)}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
        >
          <option value="">親: なし（会社ゴール）</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              親: {g.title}
            </option>
          ))}
        </select>
      )}
      <input
        value={desire}
        onChange={(e) => setDesire(e.target.value)}
        placeholder="したいこと・作りたいもの（例: 商談で使える提案書がほしい）"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
      />
      <input
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="目的（何のために）"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
      />
      <input
        value={completionCriteria}
        onChange={(e) => setCompletionCriteria(e.target.value)}
        placeholder="完了の基準（どうなったら終わりか）"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
      />
      <input
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        placeholder="担当"
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "追加する"}
        </button>
        {compact && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-2 text-sm text-ink-muted"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Goal } from "@/lib/types";
import { FolderPicker } from "@/components/FolderPicker";

// 見積時間の選択肢（0.5時間刻み〜1日）。
const HOUR_OPTIONS = [0.5, 1, 2, 3, 4, 6, 8] as const;

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
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(defaultParentId);
  const [desire, setDesire] = useState("");
  const [purpose, setPurpose] = useState("");
  const [assignee, setAssignee] = useState(""); // 実装担当
  const [reviewer, setReviewer] = useState(""); // 確認担当
  const [salesPerson, setSalesPerson] = useState(""); // 営業担当
  const [members, setMembers] = useState<string[]>([]);
  const [estimatedHours, setEstimatedHours] = useState(0);

  // 実装担当プルダウン用に承認済みメンバー名を取得。
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/members");
        const d = await res.json();
        setMembers(Array.isArray(d.members) ? d.members : []);
      } catch {
        /* 取得不可でも手入力の担当は空のまま進められる */
      }
    })();
  }, [open]);
  const [repoPath, setRepoPath] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [autoBreakdown, setAutoBreakdown] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("タイトルは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        parentId,
        desire,
        purpose,
        assignee,
        reviewer,
        salesPerson,
        estimatedHours,
        repoPath,
      }),
    });
    if (!res.ok) {
      setSaving(false);
      setError("保存に失敗しました");
      return;
    }
    const { goal } = await res.json();

    // AIで子タスクを自動生成（任意）。少し時間がかかるので状態表示する。
    if (autoBreakdown && goal?.id) {
      setStatus("AIが子タスクを生成中…（数秒〜十数秒）");
      await fetch(`/api/goals/${goal.id}/breakdown`, { method: "POST" }).catch(
        () => {},
      );
    }

    setSaving(false);
    setStatus(null);
    setTitle("");
    setDesire("");
    setPurpose("");
    setAssignee("");
    setReviewer("");
    setSalesPerson("");
    setEstimatedHours(0);
    setRepoPath("");
    setOpen(false); // 追加完了したらフォームを閉じる
    onCreated?.();
    router.refresh();
  }

  if (!open) {
    if (compact) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        ＋ 新しいゴールを置く
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1">実装担当</label>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
          >
            <option value="">未割当</option>
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">確認担当</label>
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="名前を入力"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">営業担当</label>
          <input
            value={salesPerson}
            onChange={(e) => setSalesPerson(e.target.value)}
            placeholder="名前を入力"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-muted mb-1">
          実装プログラムの格納フォルダ（作業フォルダ）
          {defaultParentId && "（未指定なら親を使用）"}
        </label>
        <div className="flex gap-2">
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="例: C:\Users\me\projects\my-app"
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
          />
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:text-slate-200 hover:border-brand"
          >
            参照…
          </button>
        </div>
      </div>
      <select
        value={estimatedHours}
        onChange={(e) => setEstimatedHours(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
      >
        <option value={0}>見積時間: 未設定</option>
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            見積時間: {h}時間
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-ink-soft dark:text-slate-300">
        <input
          type="checkbox"
          checked={autoBreakdown}
          onChange={(e) => setAutoBreakdown(e.target.checked)}
          className="h-4 w-4"
        />
        AIでこのゴールに向かう子タスクを自動生成する
      </label>
      {status && <p className="text-sm text-brand">{status}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? (autoBreakdown ? "生成中…" : "保存中…") : "追加する"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-ink-muted"
        >
          キャンセル
        </button>
      </div>

      {showPicker && (
        <FolderPicker
          initialPath={repoPath || undefined}
          onSelect={(p) => {
            setRepoPath(p);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </form>
  );
}

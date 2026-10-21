"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 今日のToDoページ用の、その場でタスクを足せる簡易フォーム。
// 親なし・todoOnly=true で作成し、実装担当はログイン中の本人に固定する
//（ゴール一覧／メンバー進捗には出さない、本人専用のToDo）。
export function NewTodoForm({ assignee }: { assignee: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 二重送信ロック（Enter+クリックなどで2個作られるのを防ぐ）。
  const submittingRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          parentId: null,
          assignee,
          todoOnly: true,
        }),
      });
      if (!res.ok) {
        setError("追加に失敗しました");
        return;
      }
      setTitle("");
      router.refresh();
    } catch {
      setError("追加に失敗しました");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  return (
    <form onSubmit={submit} className="mb-4">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="新しいToDoを追加（例: 提案書の体裁を整える）"
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
        />
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "追加中…" : "＋ 追加"}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </form>
  );
}

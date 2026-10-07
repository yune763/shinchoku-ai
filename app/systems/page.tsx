"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";

interface SystemItem {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/systems");
    const d = await res.json().catch(() => ({ systems: [] }));
    setSystems(d.systems ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("システム名は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "登録に失敗しました");
      return;
    }
    setName("");
    setUrl("");
    await load();
  }

  async function remove(item: SystemItem) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    await fetch(`/api/systems/${item.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-10">
      <PageHeader
        title="システム一覧"
        desc="社内で使っているシステムの名前とURLを登録・共有します。"
      />

      {/* 新規登録 */}
      <form
        onSubmit={add}
        className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
      >
        <div className="text-sm font-semibold dark:text-white">新規登録</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-ink-muted mb-1">システム名 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 進捗管理AI"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "登録中…" : "登録する"}
        </button>
      </form>

      {/* 一覧 */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {systems.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted dark:text-slate-400">
            まだ登録がありません。上のフォームから登録してください。
          </div>
        ) : (
          systems.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink dark:text-slate-200">
                  {s.name}
                </div>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:underline break-all"
                  >
                    {s.url}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-ink-soft dark:text-slate-200 hover:border-brand hover:text-brand"
                  >
                    開く
                  </a>
                )}
                <button
                  onClick={() => remove(s)}
                  className="text-xs text-red-600 hover:underline"
                >
                  削除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";

interface SystemItem {
  id: string;
  name: string;
  url: string;
  operationSteps: string;
  tools: string[];
  createdAt: string;
}

type Draft = {
  id?: string;
  name: string;
  url: string;
  operationSteps: string;
  tools: string[];
};

const EMPTY: Draft = { name: "", url: "", operationSteps: "", tools: [] };

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/systems");
    const d = await res.json().catch(() => ({ systems: [] }));
    setSystems(d.systems ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(item: SystemItem) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    await fetch(`/api/systems/${item.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-10">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="システム一覧"
          desc="社内で使っているシステムの名前・URL・操作手順・使用ツールを登録・共有します。"
        />
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          ＋ 新規登録
        </button>
      </div>

      {/* 一覧 */}
      <div className="space-y-3">
        {systems.length === 0 ? (
          <div className="rounded-card border border-dashed border-slate-300 p-10 text-center text-sm text-ink-muted">
            まだ登録がありません。「＋ 新規登録」から登録してください。
          </div>
        ) : (
          systems.map((s) => (
            <div
              key={s.id}
              className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-ink dark:text-slate-100">
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
                <div className="flex shrink-0 items-center gap-2">
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
                    onClick={() =>
                      setEditing({
                        id: s.id,
                        name: s.name,
                        url: s.url,
                        operationSteps: s.operationSteps,
                        tools: [...s.tools],
                      })
                    }
                    className="text-xs text-brand hover:underline"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => remove(s)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    削除
                  </button>
                </div>
              </div>

              {s.operationSteps && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-ink-muted">操作手順</div>
                  <p className="whitespace-pre-wrap text-sm text-ink-soft dark:text-slate-300">
                    {s.operationSteps}
                  </p>
                </div>
              )}

              {s.tools.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-ink-muted">使用ツール</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.tools.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-ink-soft dark:text-slate-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {editing && (
        <SystemEditModal
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function SystemEditModal({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Draft>(draft);
  const [toolDraft, setToolDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!v.id;

  function addTool() {
    const t = toolDraft.trim();
    if (!t) return;
    setV({ ...v, tools: [...v.tools, t] });
    setToolDraft("");
  }
  function removeTool(i: number) {
    setV({ ...v, tools: v.tools.filter((_, idx) => idx !== i) });
  }

  async function save() {
    if (!v.name.trim()) {
      setError("システム名は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      name: v.name,
      url: v.url,
      operationSteps: v.operationSteps,
      tools: v.tools,
    });
    const res = await fetch(isEdit ? `/api/systems/${v.id}` : "/api/systems", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "保存に失敗しました");
      return;
    }
    onSaved();
  }

  const input =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card bg-white dark:bg-slate-900 p-5 space-y-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold dark:text-white">
            {isEdit ? "システムを編集" : "システムを新規登録"}
          </h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="text-xl leading-none text-ink-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-xs text-ink-muted mb-1">システム名 *</label>
          <input
            className={input}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder="例: 進捗管理AI"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">URL</label>
          <input
            className={input}
            value={v.url}
            onChange={(e) => setV({ ...v, url: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">操作手順</label>
          <textarea
            className={input}
            rows={4}
            value={v.operationSteps}
            onChange={(e) => setV({ ...v, operationSteps: e.target.value })}
            placeholder="使い方・手順を記載"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">使用ツール</label>
          {v.tools.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {v.tools.map((t, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-ink-soft dark:text-slate-300"
                >
                  {t}
                  <button
                    onClick={() => removeTool(i)}
                    aria-label="削除"
                    className="text-ink-muted hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={input}
              value={toolDraft}
              onChange={(e) => setToolDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTool();
                }
              }}
              placeholder="ツール名を入力してEnter または 追加"
            />
            <button
              type="button"
              onClick={addTool}
              className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:text-slate-200 hover:border-brand"
            >
              追加
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-ink-muted"
          >
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

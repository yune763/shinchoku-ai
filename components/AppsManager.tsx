"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AppItem,
  AppInput,
  LinkedTool,
  ApiKeyEntry,
} from "@/lib/apps-shared";

const input =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";
const label = "block text-xs text-ink-muted mb-1";

function emptyForm(): AppInput {
  return {
    name: "",
    appUrl: "",
    shareAddress: "",
    linkedTools: [],
    systemDriveUrl: "",
    specDriveUrl: "",
    apiKeys: [],
  };
}

function toForm(a: AppItem): AppInput {
  return {
    name: a.name,
    appUrl: a.appUrl,
    shareAddress: a.shareAddress,
    linkedTools: a.linkedTools ?? [],
    systemDriveUrl: a.systemDriveUrl,
    specDriveUrl: a.specDriveUrl,
    apiKeys: a.apiKeys ?? [],
  };
}

export function AppsManager({ initialApps }: { initialApps: AppItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AppItem | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="mt-4">
      <div className="mb-4">
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          ＋ アプリを追加
        </button>
      </div>

      {initialApps.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-ink-muted dark:text-slate-400">
          登録された自主制作アプリはまだありません。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {initialApps.map((a) => (
            <AppCard key={a.id} app={a} onEdit={() => setEditing(a)} />
          ))}
        </div>
      )}

      {(adding || editing) && (
        <AppForm
          initial={editing ? toForm(editing) : emptyForm()}
          title={editing ? "アプリを編集" : "アプリを追加"}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            router.refresh();
          }}
          editingId={editing?.id ?? null}
        />
      )}
    </div>
  );
}

function Row({ k, v, href }: { k: string; v: string; href?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 w-28 text-ink-muted dark:text-slate-500">{k}</span>
      {href ? (
        <a
          href={v}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate text-brand hover:underline"
        >
          {v}
        </a>
      ) : (
        <span className="min-w-0 truncate dark:text-slate-200">{v}</span>
      )}
    </div>
  );
}

function AppCard({ app, onEdit }: { app: AppItem; onEdit: () => void }) {
  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-ink dark:text-white truncate">{app.name}</h3>
        <button
          onClick={onEdit}
          className="shrink-0 text-sm text-brand hover:underline"
        >
          編集
        </button>
      </div>
      <Row k="本体URL" v={app.appUrl} href />
      <Row k="権限共有" v={app.shareAddress} />
      <Row k="システム格納" v={app.systemDriveUrl} href />
      <Row k="仕様書格納" v={app.specDriveUrl} href />
      {app.linkedTools?.length > 0 && (
        <div className="text-sm">
          <span className="text-ink-muted dark:text-slate-500">連動ツール：</span>
          <span className="dark:text-slate-200">
            {app.linkedTools.map((t) => t.name).filter(Boolean).join(" / ") || "—"}
          </span>
        </div>
      )}
      {app.apiKeys?.length > 0 && (
        <div className="text-sm">
          <span className="text-ink-muted dark:text-slate-500">APIキー：</span>
          <span className="dark:text-slate-200">
            {app.apiKeys.map((k) => k.name).filter(Boolean).join(" / ") || "—"}（
            {app.apiKeys.length}件）
          </span>
        </div>
      )}
    </div>
  );
}

function AppForm({
  initial,
  title,
  editingId,
  onClose,
  onSaved,
}: {
  initial: AppInput;
  title: string;
  editingId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<AppInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AppInput>(key: K, val: AppInput[K]) =>
    setV((p) => ({ ...p, [key]: val }));

  // 連動ツールの行操作。
  const addTool = () =>
    set("linkedTools", [
      ...v.linkedTools,
      { name: "", url: "", loginId: "", password: "", project: "" },
    ]);
  const setTool = (i: number, patch: Partial<LinkedTool>) =>
    set(
      "linkedTools",
      v.linkedTools.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    );
  const removeTool = (i: number) =>
    set("linkedTools", v.linkedTools.filter((_, idx) => idx !== i));

  // APIキーの行操作。
  const addKey = () => set("apiKeys", [...v.apiKeys, { name: "", key: "" }]);
  const setKey = (i: number, patch: Partial<ApiKeyEntry>) =>
    set(
      "apiKeys",
      v.apiKeys.map((k, idx) => (idx === i ? { ...k, ...patch } : k)),
    );
  const removeKey = (i: number) =>
    set("apiKeys", v.apiKeys.filter((_, idx) => idx !== i));

  async function save() {
    if (!v.name.trim()) {
      setError("アプリ名は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/apps/${editingId}` : "/api/apps";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "保存に失敗しました");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    if (!confirm("このアプリを削除します。よろしいですか？")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/apps/${editingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="text-xl leading-none text-ink-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        <div>
          <label className={label}>アプリ名 *</label>
          <input
            className={input}
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="例: 進捗管理AI"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>本体URL</label>
            <input className={input} value={v.appUrl} onChange={(e) => set("appUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className={label}>権限共有アドレス</label>
            <input className={input} value={v.shareAddress} onChange={(e) => set("shareAddress", e.target.value)} placeholder="共有先のメール等" />
          </div>
          <div>
            <label className={label}>システム格納ドライブURL</label>
            <input className={input} value={v.systemDriveUrl} onChange={(e) => set("systemDriveUrl", e.target.value)} placeholder="https://drive..." />
          </div>
          <div>
            <label className={label}>仕様書格納ドライブURL</label>
            <input className={input} value={v.specDriveUrl} onChange={(e) => set("specDriveUrl", e.target.value)} placeholder="https://drive..." />
          </div>
        </div>

        {/* 連動ツール（増減可能） */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium dark:text-slate-200">連動ツール</span>
            <button type="button" onClick={addTool} className="text-sm text-brand hover:underline">
              ＋ ツールを追加
            </button>
          </div>
          {v.linkedTools.length === 0 ? (
            <p className="text-xs text-ink-muted">まだありません。「＋ ツールを追加」で行を増やせます。</p>
          ) : (
            v.linkedTools.map((t, i) => (
              <div key={i} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">ツール #{i + 1}</span>
                  <button type="button" onClick={() => removeTool(i)} className="text-xs text-red-600 hover:underline">
                    削除
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input className={input} value={t.name} onChange={(e) => setTool(i, { name: e.target.value })} placeholder="ツール名" />
                  <input className={input} value={t.url} onChange={(e) => setTool(i, { url: e.target.value })} placeholder="URL" />
                  <input className={input} value={t.loginId} onChange={(e) => setTool(i, { loginId: e.target.value })} placeholder="ID" />
                  <input className={input} value={t.password} onChange={(e) => setTool(i, { password: e.target.value })} placeholder="PASS" />
                  <input className={`${input} sm:col-span-2`} value={t.project} onChange={(e) => setTool(i, { project: e.target.value })} placeholder="プロジェクト名" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* APIキー（増減可能） */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium dark:text-slate-200">APIキー</span>
            <button type="button" onClick={addKey} className="text-sm text-brand hover:underline">
              ＋ APIキーを追加
            </button>
          </div>
          {v.apiKeys.length === 0 ? (
            <p className="text-xs text-ink-muted">まだありません。「＋ APIキーを追加」で行を増やせます。</p>
          ) : (
            v.apiKeys.map((k, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input className={input} value={k.name} onChange={(e) => setKey(i, { name: e.target.value })} placeholder="ツール名" />
                <input className={input} value={k.key} onChange={(e) => setKey(i, { key: e.target.value })} placeholder="APIキー" />
                <button type="button" onClick={() => removeKey(i)} className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-red-600 hover:border-red-400">
                  削除
                </button>
              </div>
            ))
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <div>
            {editingId && (
              <button onClick={remove} disabled={saving} className="text-sm text-red-600 hover:underline disabled:opacity-50">
                このアプリを削除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
              キャンセル
            </button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

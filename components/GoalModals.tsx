"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 3点メニューの各項目を MSGBOX（モーダル）で設定するための共通コンポーネント群。

const input =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

// ── 共通モーダルの外枠 ──
function Shell({
  title,
  desc,
  onClose,
  children,
  footer,
}: {
  title: string;
  desc?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="font-semibold dark:text-white truncate">{title}</h2>
            {desc && (
              <p className="text-xs text-ink-muted dark:text-slate-400">{desc}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink text-xl leading-none shrink-0"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-3">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          {footer}
        </div>
      </div>
    </div>
  );
}

async function patchGoal(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "保存に失敗しました");
  }
}

interface GoalData {
  title: string;
  desire: string;
  purpose: string;
  currentStatus: string;
  completionCriteria: string;
  assignee: string;
  dueDate: string | null;
  kpi?: string;
}

function useGoal(goalId: string) {
  const [goal, setGoal] = useState<GoalData | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/goals/${goalId}`);
        const d = await res.json();
        if (active && res.ok) setGoal(d.goal ?? d);
      } catch {
        /* noop */
      }
    })();
    return () => {
      active = false;
    };
  }, [goalId]);
  return goal;
}

function SaveButtons({
  onSave,
  onClose,
  saving,
  saveLabel = "保存",
}: {
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  return (
    <>
      <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
        キャンセル
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "保存中…" : saveLabel}
      </button>
    </>
  );
}

// ── 編集：ゴール内容 ──
export function EditModal({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const router = useRouter();
  const goal = useGoal(goalId);
  const [v, setV] = useState<GoalData | null>(null);
  const [saving, setSaving] = useState(false);
  const [gen, setGen] = useState(false);
  useEffect(() => {
    if (goal && !v) setV(goal);
  }, [goal, v]);

  async function genCriteria() {
    setGen(true);
    try {
      const res = await fetch(`/api/goals/${goalId}/criteria`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.completionCriteria && v)
        setV({ ...v, completionCriteria: d.completionCriteria });
      else alert(d.error ?? "完了基準の生成に失敗しました");
    } finally {
      setGen(false);
    }
  }

  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      await patchGoal(goalId, {
        title: v.title,
        desire: v.desire,
        purpose: v.purpose,
        currentStatus: v.currentStatus,
        completionCriteria: v.completionCriteria,
      });
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  return (
    <Shell
      title="ゴールを編集"
      desc="内容を編集します"
      onClose={onClose}
      footer={<SaveButtons onSave={save} onClose={onClose} saving={saving} />}
    >
      {!v ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : (
        <>
          <label className="block text-xs text-ink-muted">タイトル</label>
          <input className={input} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          <label className="block text-xs text-ink-muted">したいこと</label>
          <textarea className={input} rows={2} value={v.desire} onChange={(e) => setV({ ...v, desire: e.target.value })} />
          <label className="block text-xs text-ink-muted">目的</label>
          <textarea className={input} rows={2} value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} />
          <label className="block text-xs text-ink-muted">現状</label>
          <textarea className={input} rows={2} value={v.currentStatus} onChange={(e) => setV({ ...v, currentStatus: e.target.value })} />
          <div className="flex items-center justify-between">
            <label className="block text-xs text-ink-muted">完了の基準</label>
            <button type="button" onClick={genCriteria} disabled={gen} className="text-xs text-brand underline disabled:opacity-50">
              {gen ? "生成中…" : "ゴール内容から自動生成"}
            </button>
          </div>
          <textarea className={input} rows={3} value={v.completionCriteria} onChange={(e) => setV({ ...v, completionCriteria: e.target.value })} />
        </>
      )}
    </Shell>
  );
}

// ── 追加：子ゴール ──
export function AddChildModal({
  goalId,
  parentTitle,
  onClose,
}: {
  goalId: string;
  parentTitle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [desire, setDesire] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: goalId, title: title.trim(), desire: desire.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "作成に失敗しました");
      }
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "作成に失敗しました");
      setSaving(false);
    }
  }

  return (
    <Shell
      title="子ゴールを追加"
      desc={`「${parentTitle}」の配下に追加します`}
      onClose={onClose}
      footer={<SaveButtons onSave={create} onClose={onClose} saving={saving} saveLabel="追加" />}
    >
      <label className="block text-xs text-ink-muted">タイトル（動詞で始める）</label>
      <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: CSV取込APIを実装する" autoFocus />
      <label className="block text-xs text-ink-muted">したいこと（任意）</label>
      <textarea className={input} rows={2} value={desire} onChange={(e) => setDesire(e.target.value)} />
    </Shell>
  );
}

// ── 担当者・メンバー ──
export function AssigneeModal({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const router = useRouter();
  const goal = useGoal(goalId);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (goal && assignee === null) setAssignee(goal.assignee ?? "");
  }, [goal, assignee]);

  async function save() {
    setSaving(true);
    try {
      await patchGoal(goalId, { assignee: assignee ?? "" });
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  return (
    <Shell
      title="担当者・メンバー"
      desc="実装担当者を設定します（複数はカンマ区切り）"
      onClose={onClose}
      footer={<SaveButtons onSave={save} onClose={onClose} saving={saving} />}
    >
      {assignee === null ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : (
        <>
          <label className="block text-xs text-ink-muted">担当者・メンバー</label>
          <input className={input} value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="例: 山田, 佐藤" autoFocus />
        </>
      )}
    </Shell>
  );
}

// ── 期日 ──
export function DueDateModal({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const router = useRouter();
  const goal = useGoal(goalId);
  const [due, setDue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (goal && due === null) setDue(goal.dueDate ?? "");
  }, [goal, due]);

  async function save() {
    setSaving(true);
    try {
      await patchGoal(goalId, { dueDate: due ? due : null });
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  return (
    <Shell
      title="期日を設定"
      onClose={onClose}
      footer={<SaveButtons onSave={save} onClose={onClose} saving={saving} />}
    >
      {due === null ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : (
        <>
          <label className="block text-xs text-ink-muted">期日</label>
          <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
        </>
      )}
    </Shell>
  );
}

// ── KPI ──
export function KpiModal({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const router = useRouter();
  const goal = useGoal(goalId);
  const [kpi, setKpi] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (goal && kpi === null) setKpi(goal.kpi ?? "");
  }, [goal, kpi]);

  async function save() {
    setSaving(true);
    try {
      await patchGoal(goalId, { kpi: kpi ?? "" });
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  return (
    <Shell
      title="KPIを設定"
      desc="達成を測る指標（検証可能な数値で）"
      onClose={onClose}
      footer={<SaveButtons onSave={save} onClose={onClose} saving={saving} />}
    >
      {kpi === null ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : (
        <>
          <label className="block text-xs text-ink-muted">KPI</label>
          <textarea className={input} rows={3} value={kpi} onChange={(e) => setKpi(e.target.value)} placeholder="例: 照合精度95%以上 / 処理1000件をエラーなく完了" autoFocus />
        </>
      )}
    </Shell>
  );
}

// ── 削除確認 ──
export function DeleteModal({
  goalId,
  title,
  onClose,
}: {
  goalId: string;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  async function del() {
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      router.refresh();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
      setSaving(false);
    }
  }
  return (
    <Shell
      title="ゴールを削除"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            キャンセル
          </button>
          <button
            onClick={del}
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "削除中…" : "削除する"}
          </button>
        </>
      }
    >
      <p className="text-sm dark:text-slate-200">
        「{title}」とその配下の子ゴールをすべて削除します。この操作は取り消せません。
      </p>
    </Shell>
  );
}

// コメント未読管理（このPCのローカルに最終閲覧時刻を保持）。
export function commentReadKey(goalId: string) {
  return `shinchoku:commentRead:${goalId}`;
}
export function markCommentsRead(goalId: string, atISO: string) {
  try {
    localStorage.setItem(commentReadKey(goalId), atISO);
  } catch {
    /* noop */
  }
}

interface CommentLog {
  kind: string;
  author: string;
  body: string;
  createdAt: string;
}

// ── コメント：実装に関する人間側のコメント（閲覧＋追加） ──
export function CommentModal({
  goalId,
  title,
  onClose,
}: {
  goalId: string;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState<CommentLog[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/goals/${goalId}`);
      const d = await res.json();
      if (res.ok) {
        const g = d.goal ?? d;
        const comments: CommentLog[] = (g.logs ?? [])
          .filter((l: CommentLog) => l.kind === "comment")
          .sort((a: CommentLog, b: CommentLog) => b.createdAt.localeCompare(a.createdAt));
        setLogs(comments);
        // 開いた時点で既読にする（最新コメント時刻 or 現在）。
        markCommentsRead(goalId, comments[0]?.createdAt ?? new Date().toISOString());
      }
    } catch {
      setLogs([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);

  async function add() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${goalId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "comment", author: "人", body: text.trim() }),
      });
      if (!res.ok) throw new Error("コメントの追加に失敗しました");
      setText("");
      await load();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell
      title={`コメント：${title}`}
      desc="実装に関する人間側のコメント"
      onClose={onClose}
      footer={
        <button onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          閉じる
        </button>
      }
    >
      <div className="flex gap-2">
        <textarea
          className={input}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="コメントを書く…"
        />
        <button
          onClick={add}
          disabled={saving || !text.trim()}
          className="rounded-lg bg-brand px-4 text-sm font-medium text-white disabled:opacity-50 shrink-0"
        >
          追加
        </button>
      </div>
      {!logs ? (
        <p className="text-sm text-ink-muted">読み込み中…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-slate-400">まだコメントはありません。</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((l, i) => (
            <li key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[11px] text-ink-muted dark:text-slate-500 mb-1">
                {l.createdAt.slice(0, 16).replace("T", " ")} ・ {l.author}
              </div>
              <div className="text-sm whitespace-pre-wrap dark:text-slate-200">{l.body}</div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

// ── 相談結果を反映：貼り付けたテキストから完了基準＋子ゴールを更新 ──
export function ApplyConsultModal({
  goalId,
  title,
  onClose,
}: {
  goalId: string;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [genChildren, setGenChildren] = useState(true);
  const [replaceChildren, setReplaceChildren] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function apply() {
    if (!text.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/apply-consult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          generateChildren: genChildren,
          replaceChildren,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(d.error ?? "反映に失敗しました");
        setSaving(false);
        return;
      }
      router.refresh();
      setResult(`完了基準を更新しました。${d.note ?? ""}`);
    } catch {
      setResult("サーバーに接続できません");
    }
    setSaving(false);
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
    } catch {
      /* クリップボード読み取り不可。手動貼り付けで対応。 */
    }
  }

  return (
    <Shell
      title={`相談結果を反映：${title}`}
      desc="Claude Codeとの相談内容を貼り付けて、完了基準と子ゴールを更新します"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            閉じる
          </button>
          <button
            onClick={apply}
            disabled={saving || !text.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "反映中…（数秒〜十数秒）" : "反映する"}
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between">
        <label className="block text-xs text-ink-muted">相談結果（貼り付け）</label>
        <button onClick={pasteFromClipboard} className="text-xs text-brand underline">
          クリップボードから貼り付け
        </button>
      </div>
      <textarea
        className={input}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Claude Code との相談で固めた方針・要件・完了イメージをここに貼り付けてください"
      />
      <label className="flex items-center gap-2 text-sm dark:text-slate-200">
        <input type="checkbox" checked={genChildren} onChange={(e) => setGenChildren(e.target.checked)} />
        この内容に沿って子ゴールも生成/更新する
      </label>
      {genChildren && (
        <label className="flex items-center gap-2 text-sm dark:text-slate-200 pl-6">
          <input type="checkbox" checked={replaceChildren} onChange={(e) => setReplaceChildren(e.target.checked)} />
          既存の子ゴールを置き換える（削除して作り直す）
        </label>
      )}
      {result && <p className="text-sm text-brand">{result}</p>}
    </Shell>
  );
}

// ── 通知設定（配信機構は今後。設定はローカルに保持） ──
export function NotifyModal({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const key = `shinchoku:notify:${goalId}`;
  const [onComplete, setOnComplete] = useState(false);
  const [onError, setOnError] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const v = JSON.parse(raw);
        setOnComplete(!!v.onComplete);
        setOnError(!!v.onError);
      }
    } catch {
      /* noop */
    }
  }, [key]);
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify({ onComplete, onError }));
    } catch {
      /* noop */
    }
    onClose();
  }
  return (
    <Shell
      title="通知を設定"
      desc="実装の完了・エラー時の通知"
      onClose={onClose}
      footer={<SaveButtons onSave={save} onClose={onClose} saving={false} />}
    >
      <label className="flex items-center gap-2 text-sm dark:text-slate-200">
        <input type="checkbox" checked={onComplete} onChange={(e) => setOnComplete(e.target.checked)} />
        実装が完了したら通知する
      </label>
      <label className="flex items-center gap-2 text-sm dark:text-slate-200">
        <input type="checkbox" checked={onError} onChange={(e) => setOnError(e.target.checked)} />
        エラーが起きたら通知する
      </label>
      <p className="text-[11px] text-ink-muted dark:text-slate-500">
        ※ 通知の配信方法（画面内通知・メール等）は今後設定予定です。ここでは希望のみ保存します。
      </p>
    </Shell>
  );
}

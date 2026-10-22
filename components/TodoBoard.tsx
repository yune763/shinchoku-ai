"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TODO_CATEGORY_LABEL,
  TODO_CATEGORY_ORDER,
  type TodoCategory,
} from "@/lib/types";

export interface BoardTodo {
  id: string;
  title: string;
  category: TodoCategory;
  dueDate: string | null;
}

// 今日のToDoを4カテゴリ（今すぐ/今日中/保留/明日以降）の列で管理するボード。
// 各列に「＋」で追加、カードはドラッグ＆ドロップで列間を移動、期限も設定できる。
export function TodoBoard({
  todos,
  assignee,
}: {
  todos: BoardTodo[];
  assignee: string;
}) {
  const router = useRouter();
  // ドラッグ中のカードID（ドロップ先の列でハイライト判定に使う）。
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const byCat: Record<TodoCategory, BoardTodo[]> = {
    now: [],
    today: [],
    hold: [],
    later: [],
  };
  for (const t of todos) byCat[t.category].push(t);

  // カードを別カテゴリへ移動（ドロップ時）。
  async function moveTo(id: string, cat: TodoCategory) {
    const cur = todos.find((t) => t.id === id);
    if (!cur || cur.category === cat) return;
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todoCategory: cat }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {TODO_CATEGORY_ORDER.map((cat) => (
        <Column
          key={cat}
          category={cat}
          items={byCat[cat]}
          assignee={assignee}
          draggingId={draggingId}
          onDragStart={setDraggingId}
          onDragEnd={() => setDraggingId(null)}
          onDropCard={moveTo}
        />
      ))}
    </div>
  );
}

const COL_ACCENT: Record<TodoCategory, string> = {
  now: "border-t-rose-400",
  today: "border-t-amber-400",
  hold: "border-t-slate-400",
  later: "border-t-sky-400",
};

function Column({
  category,
  items,
  assignee,
  draggingId,
  onDragStart,
  onDragEnd,
  onDropCard,
}: {
  category: TodoCategory;
  items: BoardTodo[];
  assignee: string;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropCard: (id: string, cat: TodoCategory) => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false); // ドラッグがこの列の上にあるか
  const submitting = useRef(false);

  async function add() {
    if (submitting.current || !title.trim()) return;
    submitting.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          parentId: null,
          assignee,
          todoOnly: true,
          todoCategory: category,
        }),
      });
      if (res.ok) {
        setTitle("");
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/todo-id");
        if (id) onDropCard(id, category);
      }}
      className={[
        "flex flex-col rounded-card border border-t-4 bg-white dark:bg-slate-900",
        COL_ACCENT[category],
        over
          ? "border-brand ring-2 ring-brand/40"
          : "border-slate-200 dark:border-slate-800",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-sm font-bold text-ink dark:text-white">
          {TODO_CATEGORY_LABEL[category]}
          <span className="ml-1.5 text-xs font-normal text-ink-muted dark:text-slate-500">
            {items.length}
          </span>
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          aria-label="このカテゴリに追加"
          title="このカテゴリに追加"
          className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white hover:opacity-90"
        >
          ＋
        </button>
      </div>

      {adding && (
        <div className="px-3 pb-2">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            rows={2}
            autoFocus
            placeholder="やることを入力（Enterで追加）"
            className="w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700 dark:text-white"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setTitle(""); }} className="text-xs text-ink-muted">
              キャンセル
            </button>
            <button onClick={add} disabled={busy || !title.trim()} className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
              {busy ? "追加中…" : "追加"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 px-3 pb-3 min-h-[60px]">
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-muted dark:text-slate-500">
            ここへドラッグ、または「＋」で追加
          </p>
        ) : (
          items.map((t) => (
            <Card
              key={t.id}
              todo={t}
              dragging={draggingId === t.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Card({
  todo,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  todo: BoardTodo;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/goals/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    await fetch(`/api/goals/${todo.id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/todo-id", todo.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(todo.id);
      }}
      onDragEnd={onDragEnd}
      className={[
        "cursor-grab rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm shadow-sm active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800/60",
        dragging ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="whitespace-pre-wrap break-words dark:text-slate-100">
        {todo.title}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {/* 期限（項目より補助的な情報として設定可能） */}
        <label className="flex items-center gap-1 text-[11px] text-ink-muted dark:text-slate-400">
          <span>期限</span>
          <input
            type="date"
            value={todo.dueDate ?? ""}
            onChange={(e) => patch({ dueDate: e.target.value || null })}
            disabled={busy}
            className="rounded border border-slate-300 bg-transparent px-1 py-0.5 text-[11px] dark:border-slate-600 dark:text-slate-200"
          />
        </label>
        <div className="flex gap-1.5">
          <button onClick={() => patch({ status: "done" })} disabled={busy} title="完了にする" className="rounded px-1.5 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40">
            完了
          </button>
          <button onClick={remove} disabled={busy} title="削除" className="rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40">
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

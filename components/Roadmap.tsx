"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Goal, Step, STEP_ACTOR, STEP_ACTOR_LABEL, StepActor } from "@/lib/types";

// ロードマップ表示。onlyHuman=true でガイド用（人のステップだけ・リンク表示）。
export function Roadmap({
  goal,
  editable = true,
  onlyHuman = false,
}: {
  goal: Goal;
  editable?: boolean;
  onlyHuman?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const steps = onlyHuman
    ? goal.steps.filter((s) => s.actor === STEP_ACTOR.human)
    : goal.steps;

  const firstUndoneId = goal.steps.find((s) => !s.done)?.id ?? null;

  async function toggle(step: Step) {
    await fetch(`/api/goals/${goal.id}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !step.done }),
    });
    router.refresh();
  }

  async function remove(step: Step) {
    await fetch(`/api/goals/${goal.id}/steps/${step.id}`, { method: "DELETE" });
    router.refresh();
  }

  if (goal.steps.length === 0 && !editable) {
    return (
      <p className="text-sm text-ink-muted dark:text-slate-400">
        ロードマップ未設定です。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-1.5">
        {steps.map((s) => {
          const isCurrent = s.id === firstUndoneId;
          return (
            <li
              key={s.id}
              className={[
                "flex items-start gap-3 rounded-lg px-3 py-2 border",
                isCurrent
                  ? "border-brand bg-brand-bg dark:bg-blue-900/20"
                  : "border-slate-200 dark:border-slate-800",
              ].join(" ")}
            >
              <button
                onClick={() => toggle(s)}
                className={[
                  "mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs",
                  s.done
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-slate-400 dark:border-slate-600",
                ].join(" ")}
                aria-label={s.done ? "未完了に戻す" : "完了にする"}
              >
                {s.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                ) : null}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={[
                      "text-sm",
                      s.done
                        ? "line-through text-ink-muted dark:text-slate-500"
                        : "dark:text-slate-200",
                    ].join(" ")}
                  >
                    {s.title}
                  </span>
                  <span className="text-[10px] rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-ink-muted dark:text-slate-400">
                    {STEP_ACTOR_LABEL[s.actor]}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-brand text-white">
                      現在地
                    </span>
                  )}
                </div>
                {s.note && (
                  <p className="text-xs text-ink-muted dark:text-slate-500 mt-0.5">
                    {s.note}
                  </p>
                )}
                {s.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.links.map((l, i) => (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand hover:underline"
                      >
                        {l.label || l.url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {editable && (
                <button
                  onClick={() => remove(s)}
                  className="text-ink-muted hover:text-red-600 text-xs"
                  aria-label="削除"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {editable && !onlyHuman && (
        <div>
          {adding ? (
            <AddStepForm goalId={goal.id} onDone={() => setAdding(false)} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-sm text-brand hover:underline"
            >
              ＋ ステップを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddStepForm({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [actor, setActor] = useState<StepActor>(STEP_ACTOR.ai);
  const [note, setNote] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const links = linkUrl.trim()
      ? [{ label: linkLabel || linkUrl, url: linkUrl }]
      : [];
    await fetch(`/api/goals/${goalId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, actor, note, links }),
    });
    setSaving(false);
    onDone();
    router.refresh();
  }

  const input =
    "rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ステップ名"
          className={`flex-1 ${input}`}
        />
        <select
          value={actor}
          onChange={(e) => setActor(e.target.value as StepActor)}
          className={input}
        >
          <option value={STEP_ACTOR.ai}>AI</option>
          <option value={STEP_ACTOR.human}>人</option>
        </select>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="補足（任意）"
        className={`w-full ${input}`}
      />
      <div className="flex gap-2">
        <input
          value={linkLabel}
          onChange={(e) => setLinkLabel(e.target.value)}
          placeholder="リンク名（任意）"
          className={`w-1/3 ${input}`}
        />
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="リンクURL（任意）"
          className={`flex-1 ${input}`}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={add}
          disabled={saving}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          追加
        </button>
        <button onClick={onDone} className="text-sm text-ink-muted px-3">
          キャンセル
        </button>
      </div>
    </div>
  );
}

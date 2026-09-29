"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STEP_ACTOR, StepActor } from "@/lib/types";

interface DraftStep {
  title: string;
  actor: StepActor;
  note: string;
}

/**
 * したいこと（desire）から、完了の基準＋ステップの下書きを生成し、
 * 確認・微修正してから適用する。既存のステップは差し替えになる。
 */
export function PlanModal({
  goalId,
  onClose,
}: {
  goalId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/goals/${goalId}/plan`);
      if (!active) return;
      const data = await res.json();
      if (data.plan) {
        setCriteria(data.plan.completionCriteria);
        setSteps(data.plan.steps);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [goalId]);

  async function apply() {
    setSaving(true);
    await fetch(`/api/goals/${goalId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completionCriteria: criteria, steps }),
    });
    setSaving(false);
    onClose();
    router.refresh();
  }

  const input =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold dark:text-white">
            AIに完了の基準とステップを書かせる（下書き）
          </h2>
          <p className="text-xs text-ink-muted dark:text-slate-400">
            内容を確認・修正して「適用」を押すと、完了の基準とロードマップに反映されます。
          </p>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-ink-muted">生成中…</p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-ink-muted mb-1">
                  完了の基準
                </label>
                <textarea
                  value={criteria}
                  onChange={(e) => setCriteria(e.target.value)}
                  rows={4}
                  className={input}
                />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-2">
                  ステップ（ロードマップ）
                </label>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex gap-2 items-start rounded-lg border border-slate-200 dark:border-slate-800 p-2"
                    >
                      <span className="text-xs text-ink-muted mt-2 w-4">
                        {i + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <input
                          value={s.title}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, title: e.target.value } : x,
                              ),
                            )
                          }
                          className={input}
                        />
                        <input
                          value={s.note}
                          onChange={(e) =>
                            setSteps((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, note: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder="補足"
                          className={`${input} text-xs`}
                        />
                      </div>
                      <select
                        value={s.actor}
                        onChange={(e) =>
                          setSteps((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? { ...x, actor: e.target.value as StepActor }
                                : x,
                            ),
                          )
                        }
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-2 text-sm dark:text-white"
                      >
                        <option value={STEP_ACTOR.ai}>AI</option>
                        <option value={STEP_ACTOR.human}>人</option>
                      </select>
                      <button
                        onClick={() =>
                          setSteps((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="text-ink-muted hover:text-red-600 mt-2"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setSteps((prev) => [
                        ...prev,
                        { title: "", actor: STEP_ACTOR.ai, note: "" },
                      ])
                    }
                    className="text-sm text-brand hover:underline"
                  >
                    ＋ ステップを足す
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            キャンセル
          </button>
          <button
            onClick={apply}
            disabled={saving || loading}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "適用中…" : "適用する（ステップを差し替え）"}
          </button>
        </div>
      </div>
    </div>
  );
}

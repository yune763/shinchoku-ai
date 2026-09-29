"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Goal,
  GOAL_STATUS,
  GOAL_STATUS_LABEL,
  GoalStatus,
  LOG_KIND,
} from "@/lib/types";
import { StatusBadge, ProgressBar } from "@/components/ui";
import { NewGoalForm } from "@/components/NewGoalForm";
import { AiRequestModal } from "@/components/AiRequestModal";
import { PlanModal } from "@/components/PlanModal";
import { Roadmap } from "@/components/Roadmap";
import { ActiveToggle } from "@/components/ActiveToggle";

const LOG_KIND_LABEL: Record<string, string> = {
  [LOG_KIND.comment]: "コメント",
  [LOG_KIND.deliverable]: "成果物",
  [LOG_KIND.aiRequest]: "AI依頼",
  [LOG_KIND.aiResult]: "AI結果",
  [LOG_KIND.statusChange]: "状態変更",
  [LOG_KIND.stepDone]: "ステップ",
  [LOG_KIND.commit]: "コミット",
};

export function GoalDetail({
  goal,
  all,
  children,
  computedProgress,
}: {
  goal: Goal;
  all: Goal[];
  children: Goal[];
  computedProgress: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const isLeaf = children.length === 0;
  const displayProgress = isLeaf ? goal.progress : computedProgress;

  async function patch(body: Partial<Goal>) {
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function remove() {
    if (!confirm("このゴールと子孫をすべて削除します。よろしいですか？")) return;
    await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    router.push("/goals");
  }

  return (
    <div className="space-y-6">
      {/* ヘッダ */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold dark:text-white break-words">
            {goal.title}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={goal.status} />
            <span className="text-sm text-ink-muted dark:text-slate-400">
              担当 {goal.assignee || "—"} ・ 期日 {goal.dueDate || "—"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0 items-stretch">
          <button
            onClick={() => setShowAi(true)}
            className="rounded-lg bg-ink text-white px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            AIに依頼する
          </button>
          <ActiveToggle goalId={goal.id} />
        </div>
      </div>

      {/* ページ内リンク */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/goals/${goal.id}/status`}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 hover:border-brand dark:text-slate-300"
        >
          状況まとめ
        </Link>
        <Link
          href={`/goals/${goal.id}/guide`}
          className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 hover:border-brand dark:text-slate-300"
        >
          作業ガイド（人向け）
        </Link>
      </div>

      {/* 進捗 */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-medium dark:text-slate-300">進捗</span>
          <span className="text-sm tabular-nums text-ink-muted dark:text-slate-400">
            {goal.steps.length > 0
              ? `${goal.progress}%（ステップ ${goal.steps.filter((s) => s.done).length}/${goal.steps.length}）`
              : isLeaf
                ? `${goal.progress}%`
                : `${computedProgress}%（子から算出）`}
          </span>
        </div>
        <ProgressBar value={displayProgress} />
        <div className="flex flex-wrap gap-2 mt-4">
          {(Object.values(GOAL_STATUS) as GoalStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => patch({ status: s })}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium border",
                goal.status === s
                  ? "bg-brand text-white border-brand"
                  : "border-slate-300 dark:border-slate-700 text-ink-muted dark:text-slate-400 hover:border-brand",
              ].join(" ")}
            >
              {GOAL_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* ロードマップ */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold dark:text-white">ロードマップ（道のりと現在地）</h2>
          <button
            onClick={() => setShowPlan(true)}
            className="text-sm text-brand hover:underline"
          >
            AIに計画を書かせる
          </button>
        </div>
        <Roadmap goal={goal} editable />
      </div>

      {/* 文脈 */}
      {editing ? (
        <EditForm goal={goal} onSaved={() => setEditing(false)} />
      ) : (
        <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold dark:text-white">文脈</h2>
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-brand hover:underline"
            >
              編集
            </button>
          </div>
          <Field label="したいこと（作りたいもの）" value={goal.desire} />
          <Field label="目的（何のために）" value={goal.purpose} />
          <Field label="現状" value={goal.currentStatus} />
          <Field label="完了の基準" value={goal.completionCriteria} />
        </div>
      )}

      {/* 完了レビュー */}
      <ReviewSection goal={goal} />

      {/* 子ゴール */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="font-semibold dark:text-white">子ゴール / ToDo</h2>
        {children.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-slate-400">
            子ゴールはありません（これは実行するToDoです）。
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/goals/${c.id}`}
                className="flex items-center gap-3 py-2 hover:text-brand"
              >
                <span className="flex-1 min-w-0 truncate dark:text-slate-200">
                  {c.title}
                </span>
                <span className="text-xs tabular-nums text-ink-muted dark:text-slate-500">
                  {c.progress}%
                </span>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        )}
        <div className="pt-2">
          <NewGoalForm goals={all} defaultParentId={goal.id} compact />
        </div>
      </div>

      {/* 経緯 */}
      <LogSection goal={goal} />

      <button onClick={remove} className="text-sm text-red-600 hover:underline">
        このゴールを削除
      </button>

      {showAi && (
        <AiRequestModal goalId={goal.id} onClose={() => setShowAi(false)} />
      )}
      {showPlan && (
        <PlanModal goalId={goal.id} onClose={() => setShowPlan(false)} />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-muted dark:text-slate-500 mb-1">
        {label}
      </div>
      <p className="text-sm whitespace-pre-wrap dark:text-slate-200">
        {value || "—（未記入）"}
      </p>
    </div>
  );
}

function ReviewSection({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [learnings, setLearnings] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/goals/${goal.id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary, outcome, learnings, reviewer: reviewer || "人" }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  const input =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

  if (goal.review) {
    return (
      <div className="rounded-card border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 p-5 space-y-3">
        <h2 className="font-semibold text-green-800 dark:text-green-300">
          完了レビュー
        </h2>
        <Field label="やったこと" value={goal.review.summary} />
        <Field label="成果" value={goal.review.outcome} />
        <Field label="学び・申し送り" value={goal.review.learnings} />
        <p className="text-xs text-ink-muted dark:text-slate-500">
          記録: {goal.review.reviewer} ・{" "}
          {goal.review.reviewedAt.slice(0, 16).replace("T", " ")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold dark:text-white">完了レビュー</h2>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="text-sm text-brand hover:underline"
          >
            レビューを記録して完了にする
          </button>
        )}
      </div>
      {open ? (
        <div className="space-y-2">
          <label className="block text-xs text-ink-muted">やったこと</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className={input} />
          <label className="block text-xs text-ink-muted">成果（成果物・結果）</label>
          <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} className={input} />
          <label className="block text-xs text-ink-muted">学び・次への申し送り</label>
          <textarea value={learnings} onChange={(e) => setLearnings(e.target.value)} rows={2} className={input} />
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="記録者（任意）" className={input} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "保存中…" : "完了として記録"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted dark:text-slate-400">
          完了したら、やったこと・成果・申し送りを残しましょう。記録するとこのゴールは完了になります。
        </p>
      )}
    </div>
  );
}

function EditForm({ goal, onSaved }: { goal: Goal; onSaved: () => void }) {
  const router = useRouter();
  const [desire, setDesire] = useState(goal.desire);
  const [purpose, setPurpose] = useState(goal.purpose);
  const [currentStatus, setCurrentStatus] = useState(goal.currentStatus);
  const [completionCriteria, setCompletionCriteria] = useState(goal.completionCriteria);
  const [assignee, setAssignee] = useState(goal.assignee);
  const [dueDate, setDueDate] = useState(goal.dueDate ?? "");
  const [progress, setProgress] = useState(goal.progress);
  const [saving, setSaving] = useState(false);
  const hasSteps = goal.steps.length > 0;

  async function save() {
    setSaving(true);
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        desire,
        purpose,
        currentStatus,
        completionCriteria,
        assignee,
        dueDate: dueDate || null,
        ...(hasSteps ? {} : { progress: Number(progress) }),
      }),
    });
    setSaving(false);
    onSaved();
    router.refresh();
  }

  const input =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
      <h2 className="font-semibold dark:text-white">文脈を編集</h2>
      <label className="block text-xs text-ink-muted">したいこと（作りたいもの）</label>
      <textarea value={desire} onChange={(e) => setDesire(e.target.value)} rows={2} className={input} placeholder="例: 商談でそのまま使える提案書がほしい" />
      <label className="block text-xs text-ink-muted">目的（何のために）</label>
      <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} className={input} />
      <label className="block text-xs text-ink-muted">現状</label>
      <textarea value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} rows={2} className={input} />
      <label className="block text-xs text-ink-muted">完了の基準</label>
      <textarea value={completionCriteria} onChange={(e) => setCompletionCriteria(e.target.value)} rows={3} className={input} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted">担当</label>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted">期日</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} />
        </div>
      </div>
      {!hasSteps && (
        <div>
          <label className="block text-xs text-ink-muted">進捗（%）: {progress}</label>
          <input type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full" />
        </div>
      )}
      {hasSteps && (
        <p className="text-xs text-ink-muted">
          ※ ロードマップがあるため、進捗はステップの完了状況から自動計算されます。
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "保存中…" : "保存"}
        </button>
        <button onClick={onSaved} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
          キャンセル
        </button>
      </div>
    </div>
  );
}

function LogSection({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<string>(LOG_KIND.comment);
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  const logs = [...goal.logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function add() {
    if (!body.trim()) return;
    setSaving(true);
    await fetch(`/api/goals/${goal.id}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, kind, author: author || "人" }),
    });
    setSaving(false);
    setBody("");
    router.refresh();
  }

  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <h2 className="font-semibold dark:text-white">経緯・コメント・成果物</h2>
      <div className="space-y-2">
        <div className="flex gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-2 text-sm dark:text-white">
            <option value={LOG_KIND.comment}>コメント/決定</option>
            <option value={LOG_KIND.deliverable}>成果物</option>
            <option value={LOG_KIND.aiResult}>AI結果</option>
          </select>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="名前（任意）" className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white" />
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="決めたこと・進んだこと・成果物へのリンクなど" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white" />
        <button onClick={add} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "追加中…" : "記録する"}
        </button>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-slate-400">まだ記録がありません。</p>
      ) : (
        <ul className="space-y-3">
          {logs.map((l) => (
            <li key={l.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
              <div className="text-xs text-ink-muted dark:text-slate-500">
                {l.createdAt.slice(0, 16).replace("T", " ")} ・ {LOG_KIND_LABEL[l.kind] ?? l.kind} ・ {l.author}
              </div>
              <p className="text-sm whitespace-pre-wrap dark:text-slate-200">{l.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

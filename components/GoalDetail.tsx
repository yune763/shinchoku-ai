"use client";

import { useEffect, useState } from "react";
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
import { ClaudeRunModal } from "@/components/ClaudeRunModal";
import { TreeAutoRefresh } from "@/components/TreeAutoRefresh";
import { PreviewButton } from "@/components/PreviewButton";
import { PlanModal } from "@/components/PlanModal";
import { Roadmap } from "@/components/Roadmap";
import { launchTool } from "@/lib/launch-client";
import { PromptModal } from "@/components/PromptModal";
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
  estimatedHours,
}: {
  goal: Goal;
  all: Goal[];
  children: Goal[];
  computedProgress: number;
  estimatedHours: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [openingClaude, setOpeningClaude] = useState(false);
  const [consultPrompt, setConsultPrompt] = useState<string | null>(null);
  const isLeaf = children.length === 0;

  // 作業フォルダで開発ツール（Claude Code CLI / Cursor）を開く。
  async function openTool(tool: "claude" | "cursor") {
    if (openingClaude) return;
    setOpeningClaude(true);
    try {
      const { message, prompt } = await launchTool(goal.id, tool);
      // 相談文があればモーダル表示（環境に関係なく確実にコピーできる）。
      if (prompt) setConsultPrompt(prompt);
      else alert(message);
    } finally {
      setOpeningClaude(false);
    }
  }
  // computeProgress は葉＝自身の進捗、親＝子の平均を返すので、数値もバーもこれに統一する
  // （ラベルが goal.progress、バーが computedProgress でズレていた不具合の修正）。
  const displayProgress = computedProgress;

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
      {/* 実行中はこの詳細ページも自動更新して、完了・進捗をリアルタイム反映 */}
      <TreeAutoRefresh />
      {/* ヘッダ */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold dark:text-white break-words">
            {goal.title}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={goal.status} />
            <span className="text-sm text-ink-muted dark:text-slate-400">
              実装 {goal.assignee || "—"} ・ 確認 {goal.reviewer || "—"} ・ 営業 {goal.salesPerson || "—"} ・ 期日 {goal.dueDate || "—"} ・ 推定実装時間 {estimatedHours}h
            </span>
          </div>
          {goal.forecast && (
            <div className="mt-2 text-sm">
              <span className="text-xs text-ink-muted dark:text-slate-400">完了見込み：</span>
              <span className="font-medium text-brand">{goal.forecast}</span>
            </div>
          )}
          <div className="mt-2 text-sm text-ink-muted dark:text-slate-400 break-all">
            <span className="text-xs">作業フォルダ：</span>
            {goal.repoPath ? (
              <span className="font-mono dark:text-slate-300">{goal.repoPath}</span>
            ) : (
              <span className="text-ink-muted/70">未設定（「文脈を編集」で設定）</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0 items-stretch">
          <button
            onClick={() => setShowRun(true)}
            className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium hover:opacity-90"
            title={goal.repoPath ? `作業フォルダ: ${goal.repoPath}` : "作業フォルダ未設定（文脈を編集で設定）"}
          >
            Claude Codeで実装
          </button>
          <button
            onClick={() => openTool("claude")}
            disabled={openingClaude}
            className="rounded-lg border border-brand text-brand px-4 py-2 text-sm font-medium hover:bg-brand/10 disabled:opacity-50"
            title="Claude デスクトップアプリを開き、ゴールを明確にする相談を始める（指示文は自動でコピー）"
          >
            {openingClaude ? "起動中…" : "Claude Code を開く"}
          </button>
          <button
            onClick={() => openTool("cursor")}
            disabled={openingClaude}
            className="rounded-lg border border-slate-300 dark:border-slate-700 text-ink dark:text-slate-200 px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-50"
            title="このタスクの作業フォルダを Cursor で開く（指示文は『指示文をコピー』で貼り付け）"
          >
            Cursor で開く
          </button>
          <button
            onClick={() => setShowAi(true)}
            className="rounded-lg bg-ink text-white px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            指示文をコピー
          </button>
          <PreviewButton goalId={goal.id} />
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
            {!isLeaf
              ? `${computedProgress}%（子から算出）`
              : goal.steps.length > 0
                ? `${computedProgress}%（ステップ ${goal.steps.filter((s) => s.done).length}/${goal.steps.length}）`
                : `${computedProgress}%`}
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
      {showRun && (
        <ClaudeRunModal goalId={goal.id} onClose={() => setShowRun(false)} />
      )}
      {consultPrompt && (
        <PromptModal
          title="Claudeへの相談文"
          note="コピーして Claude / Claude Code / Cursor に貼り付けてください。"
          prompt={consultPrompt}
          onClose={() => setConsultPrompt(null)}
        />
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
  const [reviewer, setReviewer] = useState(goal.reviewer ?? "");
  const [salesPerson, setSalesPerson] = useState(goal.salesPerson ?? "");
  const [members, setMembers] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(goal.dueDate ?? "");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/members");
        const d = await res.json();
        setMembers(Array.isArray(d.members) ? d.members : []);
      } catch {
        /* 取得不可でも手入力で進められる */
      }
    })();
  }, []);
  const [repoPath, setRepoPath] = useState(goal.repoPath ?? "");
  const [previewCommand, setPreviewCommand] = useState(goal.previewCommand ?? "");
  const [previewUrl, setPreviewUrl] = useState(goal.previewUrl ?? "");
  const [pickingFolder, setPickingFolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [genningCriteria, setGenningCriteria] = useState(false);

  // ゴール内容から完了の基準を自動生成し、欄に反映する（保存は「保存」ボタンで）。
  async function genCriteria() {
    if (genningCriteria) return;
    setGenningCriteria(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/criteria`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.completionCriteria) {
        setCompletionCriteria(d.completionCriteria);
      } else {
        alert(d.error ?? "完了基準の自動生成に失敗しました");
      }
    } catch {
      alert("完了基準の自動生成に失敗しました（サーバーに接続できません）");
    } finally {
      setGenningCriteria(false);
    }
  }

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
        reviewer,
        salesPerson,
        dueDate: dueDate || null,
        repoPath,
        previewCommand,
        previewUrl,
      }),
    });
    setSaving(false);
    onSaved();
    router.refresh();
  }

  // Windows ネイティブの「フォルダーの参照」ダイアログ（エクスプローラー）で作業フォルダを選ぶ。
  async function pickFolderNative() {
    setPickingFolder(true);
    try {
      const res = await fetch("/api/fs/pick", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.path) setRepoPath(d.path);
    } catch {
      // 失敗時は何もしない（手入力でも設定できる）。
    }
    setPickingFolder(false);
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
      <div className="flex items-center justify-between">
        <label className="block text-xs text-ink-muted">完了の基準</label>
        <button
          type="button"
          onClick={genCriteria}
          disabled={genningCriteria}
          className="text-xs text-brand underline hover:opacity-80 disabled:opacity-50"
        >
          {genningCriteria ? "生成中…" : "ゴール内容から自動生成"}
        </button>
      </div>
      <textarea value={completionCriteria} onChange={(e) => setCompletionCriteria(e.target.value)} rows={3} className={input} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs text-ink-muted">実装担当</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input}>
            <option value="">未割当</option>
            {/* 既存値がリストに無い場合も選べるよう補う */}
            {assignee && !members.includes(assignee) && (
              <option value={assignee}>{assignee}</option>
            )}
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted">確認担当</label>
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="名前を入力" className={input} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted">営業担当</label>
          <input value={salesPerson} onChange={(e) => setSalesPerson(e.target.value)} placeholder="名前を入力" className={input} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted">期日</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-muted">作業フォルダ（Claude Code 実行先・実装物の格納先）</label>
        <div className="flex gap-2">
          <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="例: C:\\Users\\me\\projects\\my-app" className={input} />
          <button type="button" onClick={pickFolderNative} disabled={pickingFolder} className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:text-slate-200 hover:border-brand disabled:opacity-50">
            {pickingFolder ? "選択中…" : "エクスプローラーで選ぶ"}
          </button>
        </div>
        <p className="text-[11px] text-ink-muted mt-1">「Claude Codeで実装」はこのフォルダで headless 実行します。</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted">プレビュー起動コマンド</label>
          <input value={previewCommand} onChange={(e) => setPreviewCommand(e.target.value)} placeholder="npm run dev" className={input} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted">プレビューURL</label>
          <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="http://localhost:5173" className={input} />
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        ※ 見積時間と進捗は自動で算出されます（手動設定は不要です）。
      </p>
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
  // 作業ログ（Cursor等が出力したもの）を貼り付けて進捗・子タスクへ反映する欄。
  const [worklog, setWorklog] = useState("");
  const [applyingLog, setApplyingLog] = useState(false);
  const [worklogNote, setWorklogNote] = useState<string | null>(null);

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

  // 作業ログをAIに読ませ、進捗%・完了見込みの更新＋新しい子タスクの追加を行う。
  async function applyWorklog() {
    if (!worklog.trim() || applyingLog) return;
    setApplyingLog(true);
    setWorklogNote("AIが作業ログを読み取り中…");
    try {
      const res = await fetch(`/api/goals/${goal.id}/worklog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log: worklog, source: "作業ログ(貼り付け)" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWorklogNote(d.error ?? "反映に失敗しました");
      } else if (!d.estimated) {
        setWorklogNote(
          "ログは記録しましたが、AIによる進捗算出はできませんでした（サーバーにClaude CLIまたはANTHROPIC_API_KEYが必要です）。",
        );
        setWorklog("");
      } else {
        const parts = [`進捗 ${d.progress ?? "—"}%`];
        if (d.forecast) parts.push(`完了見込み: ${d.forecast}`);
        if (d.addedSubtasks > 0) parts.push(`子タスクを${d.addedSubtasks}件追加`);
        setWorklogNote(`反映しました（${parts.join(" / ")}）`);
        setWorklog("");
      }
      router.refresh();
    } catch {
      setWorklogNote("通信に失敗しました");
    } finally {
      setApplyingLog(false);
    }
  }

  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <h2 className="font-semibold dark:text-white">経緯・コメント・成果物</h2>

      {/* 作業ログ → 進捗・子タスクへ反映 */}
      <div className="rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand/10 p-3 space-y-2">
        <div className="text-sm font-medium dark:text-slate-200">
          作業ログから進捗・子タスクを更新
        </div>
        <p className="text-xs text-ink-muted dark:text-slate-400">
          Cursor等が出力した作業ログを貼り付けて実行すると、AIが内容を読み取り、進捗%・完了見込みを更新し、新たに判明した小タスクを子ゴールとして追加します。
        </p>
        <textarea
          value={worklog}
          onChange={(e) => setWorklog(e.target.value)}
          rows={4}
          placeholder="ここに作業ログ（やったこと・分かったこと・残タスクなど）を貼り付け"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={applyWorklog}
            disabled={applyingLog || !worklog.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {applyingLog ? "反映中…" : "作業ログを反映"}
          </button>
          {worklogNote && (
            <span className="text-xs text-ink-muted dark:text-slate-400">
              {worklogNote}
            </span>
          )}
        </div>
      </div>

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

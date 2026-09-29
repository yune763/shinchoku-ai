"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface GoalCtx {
  id: string;
  title: string;
  purpose: string;
  progress: number;
  completionCriteria: string;
  currentStep: { title: string; actor: string } | null;
  waitingForHuman: boolean;
  url: string;
}

interface ContextResponse {
  readme: string;
  summary: { totalGoals: number; todo: number; done: number };
  recommendedNext: GoalCtx[];
  waitingForHuman: GoalCtx[];
}

export default function AiContextPage() {
  const [data, setData] = useState<ContextResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/context")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const instruction = `# 進捗管理AIから、続きを進めてください

以下のAPIで、このプロジェクトの進捗・ゴール・現在地を取得できます。

1. まず全体を把握: GET ${origin}/api/context
   → recommendedNext[0] を対象ゴールに決める
2. 対象ゴールの指示文を取得: GET ${origin}/api/goals/{id}/prompt
   → その内容に従って「現在地のステップ」から作業する
3. 進めたら記録:
   - 結果を残す: POST ${origin}/api/goals/{id}/logs  body: {"kind":"ai_result","author":"Claude Code","body":"..."}
   - ステップ完了: PATCH ${origin}/api/goals/{id}/steps/{stepId}  body: {"done":true}
4. waitingForHuman のゴールは人の作業待ち。着手しない。

前提の再説明は不要です。取得した文脈がそのまま前提です。`;

  async function copy() {
    await navigator.clipboard.writeText(instruction);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold dark:text-white">AIコンテキスト</h1>
        <p className="text-sm text-ink-muted dark:text-slate-400 mt-1">
          開発中のClaude Codeが、このプロジェクトの目的地と現在地を自分で把握して、続きから動くための入口。
        </p>
      </div>

      {/* Claude Codeに渡す一文 */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold dark:text-white">
            Claude Code にこれを渡すだけ
          </h2>
          <button
            onClick={copy}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
        <pre className="text-xs whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-950 rounded-lg p-4 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
          {instruction}
        </pre>
      </div>

      {/* サマリ */}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="全ゴール" value={data.summary.totalGoals} />
            <Stat label="未完了" value={data.summary.todo} />
            <Stat label="完了" value={data.summary.done} />
          </div>

          <Section title="▶ AIが次に着手すべきゴール" goals={data.recommendedNext} empty="AIがすぐ着手できるゴールはありません。" />
          <Section title="⏳ 人の作業待ち" goals={data.waitingForHuman} empty="人待ちのゴールはありません。" />
        </>
      )}

      <p className="text-xs text-ink-muted dark:text-slate-500">
        機械可読な生データ:{" "}
        <a href="/api/context" target="_blank" rel="noreferrer" className="text-brand hover:underline">
          /api/context
        </a>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center">
      <div className="text-xs text-ink-muted dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold dark:text-white">{value}</div>
    </div>
  );
}

function Section({
  title,
  goals,
  empty,
}: {
  title: string;
  goals: GoalCtx[];
  empty: string;
}) {
  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <h2 className="font-semibold dark:text-white mb-3">{title}</h2>
      {goals.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id}>
              <Link
                href={g.url}
                className="block rounded-lg border border-slate-100 dark:border-slate-800 p-3 hover:border-brand"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium dark:text-slate-200 truncate">
                    {g.title}
                  </span>
                  <span className="text-xs tabular-nums text-ink-muted dark:text-slate-500">
                    {g.progress}%
                  </span>
                </div>
                {g.currentStep && (
                  <div className="text-xs text-ink-muted dark:text-slate-500 mt-1">
                    現在地: {g.currentStep.title}（{g.currentStep.actor === "human" ? "人" : "AI"}）
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { GoalStatus, GOAL_STATUS, GOAL_STATUS_LABEL } from "@/lib/types";

const STATUS_STYLE: Record<GoalStatus, string> = {
  [GOAL_STATUS.notStarted]: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  [GOAL_STATUS.inProgress]: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  [GOAL_STATUS.blocked]: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  [GOAL_STATUS.done]: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

export function StatusBadge({ status }: { status: GoalStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {GOAL_STATUS_LABEL[status]}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  desc,
  right,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-ink dark:text-white">{title}</h1>
        {desc && (
          <p className="text-sm text-ink-muted mt-1 dark:text-slate-400">{desc}</p>
        )}
      </div>
      {right}
    </div>
  );
}

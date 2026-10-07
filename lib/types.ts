import { z } from "zod";

// ── ステータスはマジック文字列を避け enum 相当で一元管理 ──
export const GOAL_STATUS = {
  notStarted: "not_started",
  inProgress: "in_progress",
  blocked: "blocked",
  done: "done",
} as const;

export type GoalStatus = (typeof GOAL_STATUS)[keyof typeof GOAL_STATUS];

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "未着手",
  in_progress: "進行中",
  blocked: "停滞",
  done: "完了",
};

// ゴールの階層レベル（会社→部署/PJ→ToDo）。表示上のラベル用。
export const GOAL_LEVEL_LABEL = ["会社ゴール", "プロジェクト", "タスク", "サブタスク"] as const;

// ステップの担い手。human=人がやる（ガイドのチェック対象）、ai=AIが進める。
export const STEP_ACTOR = { ai: "ai", human: "human" } as const;
export type StepActor = (typeof STEP_ACTOR)[keyof typeof STEP_ACTOR];
export const STEP_ACTOR_LABEL: Record<StepActor, string> = {
  ai: "AI",
  human: "人",
};

// ログの種別。AIが「何が起きたか」を把握する手がかり。
export const LOG_KIND = {
  comment: "comment", // 人のコメント・決定
  deliverable: "deliverable", // 成果物
  aiRequest: "ai_request", // AIへの依頼を発行した記録
  aiResult: "ai_result", // AIが残した結果
  statusChange: "status_change", // 状態変更
  stepDone: "step_done", // ステップ完了
  commit: "commit", // gitコミットの自動記録
} as const;

export type LogKind = (typeof LOG_KIND)[keyof typeof LOG_KIND];

export interface StepLink {
  label: string;
  url: string;
}

// ゴールを完了へ導く道のり（ロードマップ）の1ステップ。
export interface Step {
  id: string;
  title: string;
  actor: StepActor;
  done: boolean;
  note: string; // 補足・手順
  links: StepLink[]; // 参考リンク（ガイドで人を補助する）
  createdAt: string;
  doneAt: string | null;
}

// 完了時のレビュー記録。やったこと・成果・申し送りを残す。
export interface Review {
  summary: string; // 何をやったか
  outcome: string; // 結果・成果物
  learnings: string; // 学び・次への申し送り
  reviewer: string;
  reviewedAt: string;
}

export interface LogEntry {
  id: string;
  kind: LogKind;
  author: string; // "人" or AIエージェント名
  body: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  parentId: string | null;
  title: string;
  desire: string; // したいこと・作りたいもの（人が伝える入力）
  purpose: string; // 何のために（目的）
  currentStatus: string; // 現状
  completionCriteria: string; // 完了の基準
  status: GoalStatus;
  assignee: string; // 実装担当（アカウントの表示名）
  reviewer: string; // 確認担当（自由入力）
  salesPerson: string; // 営業担当（自由入力）
  dueDate: string | null;
  kpi: string; // KPI（達成を測る指標。例: 「照合精度95%以上」）
  forecast: string; // 完了見込み（作業ログからAIが算出。例: 「残り約2時間 / 10/4完了見込み」）
  repoPath: string; // Claude Code を起動する作業フォルダ（空なら未設定）
  previewCommand: string; // 実装物の起動コマンド（空なら npm run dev）
  previewUrl: string; // 起動後に開くURL（例 http://localhost:5173）
  estimatedHours: number; // 見積所要時間（0=未設定, 0.5, 1, 2 …）
  progress: number; // 0-100（ステップがあれば自動、なければ手動）
  todoOnly: boolean; // true=今日のToDo専用（ゴール一覧/メンバー進捗には出さない）
  steps: Step[]; // ロードマップ
  logs: LogEntry[];
  review: Review | null;
  createdAt: string;
  updatedAt: string;
}

// ── バリデーション（クライアント/サーバ両方で使用） ──
export const goalInputSchema = z.object({
  parentId: z.string().nullable().default(null),
  title: z.string().min(1, "タイトルは必須です"),
  desire: z.string().default(""),
  purpose: z.string().default(""),
  currentStatus: z.string().default(""),
  completionCriteria: z.string().default(""),
  status: z
    .enum([
      GOAL_STATUS.notStarted,
      GOAL_STATUS.inProgress,
      GOAL_STATUS.blocked,
      GOAL_STATUS.done,
    ])
    .default(GOAL_STATUS.notStarted),
  assignee: z.string().default(""),
  reviewer: z.string().default(""),
  salesPerson: z.string().default(""),
  dueDate: z.string().nullable().default(null),
  kpi: z.string().default(""),
  forecast: z.string().default(""),
  repoPath: z
    .string()
    .default("")
    // Windowsの「パスのコピー」の引用符・空白を除去して保存する。
    .transform((v) => v.trim().replace(/^["']+|["']+$/g, "").trim()),
  previewCommand: z.string().default(""),
  previewUrl: z
    .string()
    .default("")
    .transform((v) => v.trim().replace(/^["']+|["']+$/g, "").trim()),
  estimatedHours: z.number().min(0).default(0),
  progress: z.number().min(0).max(100).default(0),
  todoOnly: z.boolean().optional(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;

export const goalPatchSchema = goalInputSchema.partial();

export const logInputSchema = z.object({
  kind: z
    .enum([
      LOG_KIND.comment,
      LOG_KIND.deliverable,
      LOG_KIND.aiRequest,
      LOG_KIND.aiResult,
      LOG_KIND.statusChange,
      LOG_KIND.stepDone,
      LOG_KIND.commit,
    ])
    .default(LOG_KIND.comment),
  author: z.string().default("人"),
  body: z.string().min(1, "内容は必須です"),
});

export type LogInput = z.infer<typeof logInputSchema>;

export const stepLinkSchema = z.object({
  label: z.string().default(""),
  url: z.string().default(""),
});

export const stepInputSchema = z.object({
  title: z.string().min(1, "ステップ名は必須です"),
  actor: z.enum([STEP_ACTOR.ai, STEP_ACTOR.human]).default(STEP_ACTOR.ai),
  note: z.string().default(""),
  links: z.array(stepLinkSchema).default([]),
});

export type StepInput = z.infer<typeof stepInputSchema>;

export const stepPatchSchema = z.object({
  title: z.string().min(1).optional(),
  actor: z.enum([STEP_ACTOR.ai, STEP_ACTOR.human]).optional(),
  done: z.boolean().optional(),
  note: z.string().optional(),
  links: z.array(stepLinkSchema).optional(),
});

export const reviewSchema = z.object({
  summary: z.string().default(""),
  outcome: z.string().default(""),
  learnings: z.string().default(""),
  reviewer: z.string().default("人"),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

// 一括生成（AIに完了基準・ステップを書かせる）で受け取る形。
export const generatedPlanSchema = z.object({
  completionCriteria: z.string().default(""),
  purpose: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string().min(1),
        actor: z.enum([STEP_ACTOR.ai, STEP_ACTOR.human]).default(STEP_ACTOR.ai),
        note: z.string().default(""),
      }),
    )
    .default([]),
});

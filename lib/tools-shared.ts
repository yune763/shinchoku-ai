import { z } from "zod";

// 課金ツール管理の型・定数・純粋関数（fsを含まない＝クライアントでも利用可）。

export const BILLING_CYCLE = {
  monthly: "monthly",
  yearly: "yearly",
  once: "once",
  other: "other",
} as const;
export type BillingCycle = (typeof BILLING_CYCLE)[keyof typeof BILLING_CYCLE];

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "月額",
  yearly: "年額",
  once: "買い切り",
  other: "その他",
};

export interface Tool {
  id: string;
  name: string; // ツール名
  member: string; // 登録者 / 利用メンバー
  account: string; // アカウント名 / ID
  password: string; // パスワード（ローカル平文）
  url: string; // ログインURL
  plan: string; // プラン名
  amount: number; // 課金額
  currency: string; // 通貨（既定 JPY）
  cycle: BillingCycle; // 課金周期
  nextBilling: string | null; // 次回請求日 (YYYY-MM-DD)
  connected: boolean; // このシステムに連携しているか
  connectionNote: string; // 連携の内容（どう連携しているか）
  notes: string; // 備考
  createdAt: string;
  updatedAt: string;
}

export const toolInputSchema = z.object({
  name: z.string().min(1, "ツール名は必須です"),
  member: z.string().default(""),
  account: z.string().default(""),
  password: z.string().default(""),
  url: z.string().default(""),
  plan: z.string().default(""),
  amount: z.number().min(0).default(0),
  currency: z.string().default("JPY"),
  cycle: z
    .enum([
      BILLING_CYCLE.monthly,
      BILLING_CYCLE.yearly,
      BILLING_CYCLE.once,
      BILLING_CYCLE.other,
    ])
    .default(BILLING_CYCLE.monthly),
  nextBilling: z.string().nullable().default(null),
  connected: z.boolean().default(false),
  connectionNote: z.string().default(""),
  notes: z.string().default(""),
});
export type ToolInput = z.infer<typeof toolInputSchema>;
export const toolPatchSchema = toolInputSchema.partial();

// 月額換算（年額は/12、買い切り・その他は0として概算）。
export function monthlyEquivalent(t: Tool): number {
  if (t.cycle === BILLING_CYCLE.monthly) return t.amount;
  if (t.cycle === BILLING_CYCLE.yearly) return Math.round(t.amount / 12);
  return 0;
}

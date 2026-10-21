import { z } from "zod";

// 自主制作アプリの一覧管理：型・スキーマ（fsを含まない＝クライアントでも利用可）。
// 注意: password / APIキー は平文で保存される（tools管理と同様）。機密は取り扱いに注意。

// 連動ツール（増減可能）。
export interface LinkedTool {
  name: string; // ツール名
  url: string; // URL
  loginId: string; // ID
  password: string; // PASS
  project: string; // プロジェクト名
}

// APIキー（増減可能）。
export interface ApiKeyEntry {
  name: string; // ツール名
  key: string; // APIキー
}

export interface AppItem {
  id: string;
  name: string; // アプリ名
  appUrl: string; // 本体URL
  shareAddress: string; // 権限共有アドレス
  linkedTools: LinkedTool[]; // 連動ツール
  systemDriveUrl: string; // システム格納ドライブURL
  specDriveUrl: string; // 仕様書格納ドライブURL
  apiKeys: ApiKeyEntry[]; // APIキー
  createdAt: string;
  updatedAt: string;
}

export const linkedToolSchema = z.object({
  name: z.string().default(""),
  url: z.string().default(""),
  loginId: z.string().default(""),
  password: z.string().default(""),
  project: z.string().default(""),
});

export const apiKeySchema = z.object({
  name: z.string().default(""),
  key: z.string().default(""),
});

export const appInputSchema = z.object({
  name: z.string().min(1, "アプリ名は必須です"),
  appUrl: z.string().default(""),
  shareAddress: z.string().default(""),
  linkedTools: z.array(linkedToolSchema).default([]),
  systemDriveUrl: z.string().default(""),
  specDriveUrl: z.string().default(""),
  apiKeys: z.array(apiKeySchema).default([]),
});
export type AppInput = z.infer<typeof appInputSchema>;
export const appPatchSchema = appInputSchema.partial();

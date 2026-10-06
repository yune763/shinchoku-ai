import { NextResponse } from "next/server";
import { diagnose } from "@/lib/blob";

// 保存バックエンドの健全性チェック（秘密情報は返さない）。
// 本番で保存先(Firestore等)に繋がっているかを確認するための入口。
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await diagnose();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

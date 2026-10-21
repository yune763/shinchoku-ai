import { NextResponse } from "next/server";
import { runWorklogSync } from "@/lib/worklog-scan";

export const dynamic = "force-dynamic";

// アプリ自身が Claude Code のセッション記録を走査し、作業フォルダ一致のゴールへ
// 新しい作業ログを取り込む。Stopフックに依存せず、クライアントから定期的に叩かれる。
export async function POST() {
  try {
    const summary = await runWorklogSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "同期に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}

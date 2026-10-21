import { NextRequest, NextResponse } from "next/server";
import { ingestWorklog } from "@/lib/worklog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Claude Code / Cursor の「作業ログ」を受け取り、ゴール（または該当する子ゴール）へ反映する。
// 中核ロジックは lib/worklog.ts の ingestWorklog に集約（サーバー内の定期同期からも使う）。
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const log: string = typeof body?.log === "string" ? body.log : "";
  const source: string =
    typeof body?.source === "string" ? body.source : "Claude Code";

  if (!log.trim()) {
    return NextResponse.json({ error: "作業ログ(log)が必要です" }, { status: 400 });
  }

  const result = await ingestWorklog(id, log, source);
  if (!result.ok && result.error === "ゴールが見つかりません") {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}

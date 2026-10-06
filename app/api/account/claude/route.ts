import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setClaudeLinked } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// 本人が自分の Claude Code 連携を ON/OFF する（各自でログインして連携）。
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const linked = !!body?.linked;
  const user = await setClaudeLinked(me.id, linked);
  if (!user) return NextResponse.json({ error: "失敗しました" }, { status: 400 });
  return NextResponse.json({ user });
}

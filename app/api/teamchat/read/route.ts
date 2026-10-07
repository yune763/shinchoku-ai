import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getConversation, canAccess, markConversationRead } from "@/lib/chat-store";

export const dynamic = "force-dynamic";

// POST /api/teamchat/read { convId } … 指定会話を既読にする。
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const convId = String(body?.convId ?? "");
  const conv = await getConversation(convId);
  if (!conv) return NextResponse.json({ error: "会話がありません" }, { status: 404 });
  if (!canAccess(conv, me.id))
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  await markConversationRead(me.id, convId);
  return NextResponse.json({ ok: true });
}

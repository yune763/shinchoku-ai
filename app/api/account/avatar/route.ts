import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setAvatar } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// 本人がアイコン画像を設定/削除する。body.avatar は data URL（空文字で削除）。
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const avatar = typeof body?.avatar === "string" ? body.avatar : "";
  const result = await setAvatar(me.id, avatar);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user });
}

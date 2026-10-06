import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { changePassword } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// 本人がパスワードを再設定する。
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";
  const result = await changePassword(me.id, currentPassword, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

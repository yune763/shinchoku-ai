import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createRequest, listRequestsByUser } from "@/lib/requests";

export const dynamic = "force-dynamic";

// ログイン中メンバーが、管理者宛の申請・要望を登録する / 自分の申請一覧を見る。
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const requests = await listRequestsByUser(me.id);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const request = await createRequest({
      userId: me.id,
      userName: me.displayName,
      kind: String(body?.kind ?? "要望"),
      note: String(body?.note ?? ""),
    });
    return NextResponse.json({ request }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登録に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

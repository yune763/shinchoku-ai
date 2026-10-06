import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/accounts";
import { setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await authenticate(email, password);
  if (!result.ok) {
    if (result.reason === "pending") {
      return NextResponse.json(
        { error: "承認待ちです。管理者の承認後にログインできます。" },
        { status: 403 },
      );
    }
    if (result.reason === "rejected") {
      return NextResponse.json(
        { error: "このアカウントは承認されませんでした。管理者にお問い合わせください。" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが違います" },
      { status: 401 },
    );
  }
  await setSessionCookie(result.user.id);
  return NextResponse.json({ user: result.user });
}

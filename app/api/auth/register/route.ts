import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/accounts";
import { setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

// 新規登録（メール＋パスワード＋表示名）。成功したらそのままログイン状態にする。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName =
    typeof body?.displayName === "string" ? body.displayName : "";

  const result = await registerUser({ email, password, displayName });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 最初の1人（管理者）は即ログイン。それ以外は承認待ちでログインさせない。
  if (result.autoApproved) {
    await setSessionCookie(result.user.id);
    return NextResponse.json(
      { user: result.user, status: "approved" },
      { status: 201 },
    );
  }
  return NextResponse.json(
    {
      status: "pending",
      message:
        "申請を受け付けました。管理者の承認後にログインできます。",
    },
    { status: 202 },
  );
}

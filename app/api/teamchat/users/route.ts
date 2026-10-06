import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listUsers } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// DM相手を選ぶためのメンバー一覧（自分以外）。
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const users = (await listUsers()).filter((u) => u.id !== me.id);
  return NextResponse.json({ users });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listUsers } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// 実装担当プルダウン用：承認済みメンバーの表示名一覧。
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ members: [] });
  const users = await listUsers();
  const members = users
    .filter((u) => u.status === "approved")
    .map((u) => u.displayName)
    .filter(Boolean);
  return NextResponse.json({ members });
}

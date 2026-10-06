import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/session";
import {
  listPendingUsers,
  listUsers,
  decideUser,
  setRole,
  setClaudeLinked,
} from "@/lib/accounts";
import { listRequests, resolveRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

// 管理者用：承認待ちの登録申請・全メンバー・メンバー要望の一覧。
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin)
    return NextResponse.json({ error: "管理者のみ" }, { status: 403 });
  const [pending, members, requests] = await Promise.all([
    listPendingUsers(),
    listUsers(),
    listRequests(),
  ]);
  return NextResponse.json({ pending, members, requests });
}

// 管理者用の操作：
//   { action: "decide", userId, decision: "approved"|"rejected" }
//   { action: "role",   userId, role: "admin"|"member" }
//   { action: "resolveRequest", requestId }
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin)
    return NextResponse.json({ error: "管理者のみ" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const action = body?.action;
  try {
    if (action === "decide") {
      const decision = body?.decision === "approved" ? "approved" : "rejected";
      const user = await decideUser(String(body?.userId ?? ""), decision, admin.id);
      if (!user) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
      return NextResponse.json({ user });
    }
    if (action === "role") {
      const role = body?.role === "admin" ? "admin" : "member";
      // 自分自身を降格して管理者が0人になるのを防ぐ。
      if (body?.userId === admin.id && role === "member") {
        const { listUsers: lu } = await import("@/lib/accounts");
        const admins = (await lu()).filter((u) => u.role === "admin");
        if (admins.length <= 1) {
          return NextResponse.json(
            { error: "管理者が0人になるため降格できません" },
            { status: 400 },
          );
        }
      }
      const user = await setRole(String(body?.userId ?? ""), role);
      if (!user) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
      return NextResponse.json({ user });
    }
    if (action === "claude") {
      const user = await setClaudeLinked(
        String(body?.userId ?? ""),
        !!body?.linked,
      );
      if (!user) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
      return NextResponse.json({ user });
    }
    if (action === "resolveRequest") {
      const r = await resolveRequest(String(body?.requestId ?? ""), admin.id);
      if (!r) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
      return NextResponse.json({ request: r });
    }
    return NextResponse.json({ error: "actionが不正です" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "処理に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

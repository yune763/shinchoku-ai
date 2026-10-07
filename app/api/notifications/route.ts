import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listPendingUsers } from "@/lib/accounts";
import { countUnreadConversations } from "@/lib/chat-store";

export const dynamic = "force-dynamic";

// サイドバーのバッジ用：承認待ち申請数（管理者のみ）と未読トーク数をまとめて返す。
export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ pendingApplications: 0, unreadConversations: 0 });
  }
  const [pending, unread] = await Promise.all([
    me.role === "admin" ? listPendingUsers() : Promise.resolve([]),
    countUnreadConversations(me.id),
  ]);
  return NextResponse.json({
    pendingApplications: pending.length,
    unreadConversations: unread,
  });
}

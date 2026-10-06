import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserById } from "@/lib/accounts";
import {
  listConversationsFor,
  ensureDefaultChannels,
  createChannel,
  getOrCreateDm,
  type Conversation,
} from "@/lib/chat-store";

export const dynamic = "force-dynamic";

// 表示用に、DMは相手の表示名を解決して name に入れて返す。
async function decorate(conv: Conversation, meId: string) {
  if (conv.kind === "dm") {
    const otherId = conv.memberIds.find((id) => id !== meId) ?? "";
    const other = otherId ? await getUserById(otherId) : null;
    return { ...conv, name: other?.displayName ?? "(不明なユーザー)" };
  }
  return conv;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  await ensureDefaultChannels(me.id);
  const list = await listConversationsFor(me.id);
  const decorated = await Promise.all(list.map((c) => decorate(c, me.id)));
  // channel を上に、その後 DM。各々作成順。
  decorated.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "channel" ? -1 : 1));
  return NextResponse.json({ conversations: decorated });
}

// POST: チャンネル作成 or DMを開く。
//   { action: "channel", name } / { action: "dm", userId }
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const action = body?.action;
  try {
    if (action === "channel") {
      const conv = await createChannel(String(body?.name ?? ""), me.id);
      return NextResponse.json({ conversation: conv }, { status: 201 });
    }
    if (action === "dm") {
      const otherId = String(body?.userId ?? "");
      if (!otherId || otherId === me.id) {
        return NextResponse.json({ error: "相手が不正です" }, { status: 400 });
      }
      const conv = await getOrCreateDm(me.id, otherId);
      const decorated = await decorate(conv, me.id);
      return NextResponse.json({ conversation: decorated }, { status: 201 });
    }
    return NextResponse.json({ error: "actionが不正です" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "作成に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

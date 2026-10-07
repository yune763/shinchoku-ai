import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getConversation,
  canAccess,
  listMessages,
  sendMessage,
  updateMessageTask,
} from "@/lib/chat-store";
import { scoreMessage } from "@/lib/task-learn";
import { createTaskFromMessage } from "@/lib/chat-tasks";

// 自動ゴール化する最低文字数（「あ」など極端に短い誤爆を防ぐ）。
const MIN_AUTO_LENGTH = 3;

export const dynamic = "force-dynamic";

// GET /api/teamchat/messages?conv=<id> … 会話のメッセージ一覧
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const convId = req.nextUrl.searchParams.get("conv") ?? "";
  const conv = await getConversation(convId);
  if (!conv) return NextResponse.json({ error: "会話がありません" }, { status: 404 });
  if (!canAccess(conv, me.id))
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const messages = await listMessages(convId);
  return NextResponse.json({ messages });
}

// POST … メッセージ送信。送信後に「タスクらしさ」を判定し、
//   学習で確度が高ければ自動タスク化、そうでなければ候補(suggested)として印をつける。
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const convId = String(body?.convId ?? "");
  const text = String(body?.text ?? "");
  const conv = await getConversation(convId);
  if (!conv) return NextResponse.json({ error: "会話がありません" }, { status: 404 });
  if (!canAccess(conv, me.id))
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  let msg;
  try {
    msg = await sendMessage(convId, me.id, me.displayName, text);
  } catch (e) {
    const m = e instanceof Error ? e.message : "送信に失敗しました";
    return NextResponse.json({ error: m }, { status: 400 });
  }

  // タスク判定（失敗してもメッセージ送信は成功扱い）。
  // 学習が進み確度が高い（auto）なら自動でゴール化、そうでなければ候補(suggested)に。
  try {
    const { decision, score } = await scoreMessage(msg.text);
    // 極端に短い文は誤爆しやすいので自動追加せず候補どまりにする。
    const canAuto =
      decision === "auto" && msg.text.trim().length >= MIN_AUTO_LENGTH;
    if (canAuto) {
      const goal = await createTaskFromMessage(msg, me, "today", undefined, {
        auto: true,
      });
      await updateMessageTask(convId, msg.id, {
        state: "added",
        goalId: goal.id,
        target: "today",
        auto: true,
      });
      msg.task = { state: "added", goalId: goal.id, target: "today", auto: true };
    } else if (decision === "auto" || decision === "suggest") {
      await updateMessageTask(convId, msg.id, { state: "suggested" });
      msg.task = { state: "suggested" };
    }
    return NextResponse.json({ message: msg, score, decision });
  } catch {
    return NextResponse.json({ message: msg });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getConversation,
  canAccess,
  listMessages,
  updateMessageTask,
} from "@/lib/chat-store";
import { createTaskFromMessage, type TaskTarget } from "@/lib/chat-tasks";
import { recordFeedback } from "@/lib/task-learn";

export const dynamic = "force-dynamic";

// メッセージをタスク化（add）／候補を却下（dismiss）。どちらも学習に反映する。
//   { convId, messageId, action: "add"|"dismiss", target?: "today"|"goal", goalId? }
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const convId = String(body?.convId ?? "");
  const messageId = String(body?.messageId ?? "");
  const action = body?.action === "dismiss" ? "dismiss" : "add";
  const target: TaskTarget = body?.target === "goal" ? "goal" : "today";
  const goalId = typeof body?.goalId === "string" ? body.goalId : undefined;

  const conv = await getConversation(convId);
  if (!conv) return NextResponse.json({ error: "会話がありません" }, { status: 404 });
  if (!canAccess(conv, me.id))
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const msg = (await listMessages(convId)).find((m) => m.id === messageId);
  if (!msg) return NextResponse.json({ error: "メッセージがありません" }, { status: 404 });

  try {
    if (action === "dismiss") {
      await recordFeedback(msg.text, false); // 負例として学習
      const updated = await updateMessageTask(convId, messageId, {
        state: "dismissed",
      });
      return NextResponse.json({ message: updated });
    }
    // add
    const goal = await createTaskFromMessage(msg, me, target, goalId);
    await recordFeedback(msg.text, true); // 正例として学習
    const updated = await updateMessageTask(convId, messageId, {
      state: "added",
      goalId: goal.id,
      target,
      auto: false,
    });
    return NextResponse.json({ message: updated, goalId: goal.id });
  } catch (e) {
    const m = e instanceof Error ? e.message : "処理に失敗しました";
    return NextResponse.json({ error: m }, { status: 400 });
  }
}

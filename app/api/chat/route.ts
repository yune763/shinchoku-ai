import { NextRequest, NextResponse } from "next/server";
import { chat, ChatMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";

// アプリ内AIアシスタント：進捗の確認＋簡単な修正（ゴール更新/実装起動）を行う。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message: unknown = body?.message;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "メッセージが必要です" }, { status: 400 });
  }
  const history: ChatMessage[] = Array.isArray(body?.history)
    ? body.history.filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof (m as ChatMessage).content === "string" &&
          ((m as ChatMessage).role === "user" ||
            (m as ChatMessage).role === "assistant"),
      )
    : [];

  const focusGoalId =
    typeof body?.focusGoalId === "string" ? body.focusGoalId : undefined;

  try {
    const result = await chat(message, history, focusGoalId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "応答に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

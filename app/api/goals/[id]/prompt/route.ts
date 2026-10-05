import { NextRequest, NextResponse } from "next/server";
import { getGoal, listGoals, addLog } from "@/lib/store";
import { buildImplementPrompt } from "@/lib/prompt";
import { LOG_KIND } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ゴールの文脈から「AIに依頼する」指示文を生成して返す。
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  const all = await listGoals();
  const prompt = buildImplementPrompt(goal, all);
  return NextResponse.json({ prompt });
}

// 依頼を発行した記録をログに残す（誰がAIに何を頼んだかを文脈に貯める）。
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const entry = await addLog(id, {
    kind: LOG_KIND.aiRequest,
    author: "人",
    body: "このゴールの文脈でAIに作業を依頼（指示文を生成）",
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ entry }, { status: 201 });
}

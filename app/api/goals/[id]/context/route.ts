import { NextRequest, NextResponse } from "next/server";
import { getGoal, listGoals } from "@/lib/store";
import { toGoalContext } from "@/lib/context";
import { buildAiPrompt } from "@/lib/prompt";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ゴール単位の機械可読コンテキスト＋そのまま渡せる指示文。
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  const all = await listGoals();
  return NextResponse.json({
    context: toGoalContext(goal, all),
    steps: goal.steps,
    prompt: buildAiPrompt(goal, all),
  });
}

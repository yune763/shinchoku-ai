import { NextRequest, NextResponse } from "next/server";
import { getSettings, setActiveGoal } from "@/lib/settings";
import { getGoal } from "@/lib/store";
import { z } from "zod";

export const dynamic = "force-dynamic";

// 作業中ゴールの取得。
export async function GET() {
  const settings = await getSettings();
  const goal = settings.activeGoalId ? await getGoal(settings.activeGoalId) : null;
  return NextResponse.json({ activeGoalId: settings.activeGoalId, goal });
}

const schema = z.object({ activeGoalId: z.string().nullable() });

// 作業中ゴールの設定/解除。
export async function PUT(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }
  const settings = await setActiveGoal(parsed.data.activeGoalId);
  return NextResponse.json({ activeGoalId: settings.activeGoalId });
}

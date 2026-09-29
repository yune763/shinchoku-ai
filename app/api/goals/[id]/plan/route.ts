import { NextRequest, NextResponse } from "next/server";
import { getGoal, listGoals, replaceSteps, updateGoal } from "@/lib/store";
import { generatePlanDraft } from "@/lib/generate";
import { generatedPlanSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET: 完了の基準・ステップの下書きを生成して返す（AIに書かせる／下書き）。
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  const plan = generatePlanDraft(goal);
  return NextResponse.json({ plan });
}

// PUT: 生成/編集した計画を適用する（完了基準を上書き、ステップを差し替え）。
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = generatedPlanSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { completionCriteria, purpose, steps } = parsed.data;
  const updated = await updateGoal(id, {
    completionCriteria,
    ...(purpose ? { purpose } : {}),
  });
  if (!updated) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  const goal = await replaceSteps(
    id,
    steps.map((s) => ({ title: s.title, actor: s.actor, note: s.note, links: [] })),
  );
  const all = await listGoals();
  return NextResponse.json({ goal, total: all.length });
}

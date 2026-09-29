import { NextRequest, NextResponse } from "next/server";
import { createGoal, listGoals } from "@/lib/store";
import { goalInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const goals = await listGoals();
  return NextResponse.json({ goals });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = goalInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const goal = await createGoal(parsed.data);
  return NextResponse.json({ goal }, { status: 201 });
}

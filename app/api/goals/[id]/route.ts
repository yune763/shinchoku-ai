import { NextRequest, NextResponse } from "next/server";
import { deleteGoal, getGoal, updateGoal } from "@/lib/store";
import { goalPatchSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ goal });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = goalPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const goal = await updateGoal(id, parsed.data);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ goal });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = await deleteGoal(id);
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

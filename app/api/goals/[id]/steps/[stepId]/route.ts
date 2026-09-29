import { NextRequest, NextResponse } from "next/server";
import { updateStep, deleteStep } from "@/lib/store";
import { stepPatchSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; stepId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, stepId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = stepPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const step = await updateStep(id, stepId, parsed.data);
  if (!step) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ step });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, stepId } = await params;
  const ok = await deleteStep(id, stepId);
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { addStep } from "@/lib/store";
import { stepInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = stepInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const step = await addStep(id, parsed.data);
  if (!step) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ step }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { updateTool, deleteTool, toolPatchSchema } from "@/lib/tools-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = toolPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const tool = await updateTool(id, parsed.data);
  if (!tool) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ tool });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = await deleteTool(id);
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

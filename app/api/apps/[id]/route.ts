import { NextRequest, NextResponse } from "next/server";
import { updateApp, deleteApp, appPatchSchema } from "@/lib/apps-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = appPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const app = await updateApp(id, parsed.data);
  if (!app) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ app });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = await deleteApp(id);
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

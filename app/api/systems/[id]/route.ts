import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deleteSystem, updateSystem } from "@/lib/systems-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const item = await updateSystem(id, {
      name: String(body?.name ?? ""),
      url: String(body?.url ?? ""),
      operationSteps: String(body?.operationSteps ?? ""),
      tools: Array.isArray(body?.tools)
        ? (body.tools as unknown[]).map((t) => String(t))
        : [],
    });
    if (!item) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    return NextResponse.json({ system: item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteSystem(id);
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

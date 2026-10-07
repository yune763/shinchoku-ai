import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deleteSystem } from "@/lib/systems-store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteSystem(id);
  if (!ok) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

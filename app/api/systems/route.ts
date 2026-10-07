import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listSystems, createSystem } from "@/lib/systems-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  return NextResponse.json({ systems: await listSystems() });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "");
  const url = String(body?.url ?? "");
  try {
    const item = await createSystem(name, url);
    return NextResponse.json({ system: item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登録に失敗しました";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

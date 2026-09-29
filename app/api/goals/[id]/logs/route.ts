import { NextRequest, NextResponse } from "next/server";
import { addLog } from "@/lib/store";
import { logInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = logInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const entry = await addLog(id, parsed.data);
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ entry }, { status: 201 });
}

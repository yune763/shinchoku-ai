import { NextRequest, NextResponse } from "next/server";
import { startPreview, stopPreview, getPreview } from "@/lib/preview-runner";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 実装物のプレビュー状態を返す（フロントがポーリングして「準備完了→開く」に使う）。
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  return NextResponse.json({ preview: getPreview(id) });
}

// action: "start" | "stop"
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action === "stop" ? "stop" : "start";
  try {
    if (action === "stop") {
      stopPreview(id);
      return NextResponse.json({ preview: getPreview(id) });
    }
    const preview = await startPreview(id);
    return NextResponse.json({ preview }, { status: 202 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "起動に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

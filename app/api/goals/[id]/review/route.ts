import { NextRequest, NextResponse } from "next/server";
import { saveReview } from "@/lib/store";
import { reviewSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 完了レビューを保存し、ゴールを完了にする。
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const goal = await saveReview(id, parsed.data);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ goal });
}

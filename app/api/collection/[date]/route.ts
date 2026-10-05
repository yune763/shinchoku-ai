import { NextResponse } from "next/server";
import { getReport } from "@/lib/collection";

export const dynamic = "force-dynamic";

// 指定日の情報収集レポート（トピック本文込み）を返す。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  const report = await getReport(date);
  if (!report) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ report });
}

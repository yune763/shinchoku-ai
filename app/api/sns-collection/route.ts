import { NextResponse } from "next/server";
import { listReports } from "@/lib/sns-collection";

export const dynamic = "force-dynamic";

// SNS情報収集レポートの一覧（日付・件数）を返す。
export async function GET() {
  const reports = await listReports();
  return NextResponse.json({ reports });
}

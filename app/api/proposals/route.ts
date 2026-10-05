import { NextResponse } from "next/server";
import { listProposals } from "@/lib/proposals";

export const dynamic = "force-dynamic";

// 開発提案の一覧を返す（情報収集→開発提案システムの成果）。
export async function GET() {
  const proposals = await listProposals();
  return NextResponse.json({ proposals });
}

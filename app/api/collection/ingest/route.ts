import { NextRequest, NextResponse } from "next/server";
import {
  collectionIngestSchema,
  ingestReports,
} from "@/lib/collection-store";
import { checkIngestAuth } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

// 情報収集レポートを進捗管理AIに取り込む（1件/複数件）。
export async function POST(req: NextRequest) {
  const denied = checkIngestAuth(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = collectionIngestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "レポートの形式が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const incoming = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const result = await ingestReports(incoming);
  return NextResponse.json(result, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { ingestSchema, ingestProposals } from "@/lib/proposals-store";
import { checkIngestAuth } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

// 開発提案を進捗管理AIに取り込む（＝ここが提案の「正」）。
// 生成元（ローカルの情報収集→開発提案パイプライン等）が1件/複数件をPOSTする。
// 例:
//   curl -X POST http://localhost:3000/api/proposals/ingest \
//     -H "Content-Type: application/json" \
//     -d '{"id":"2026-10-01-foo","date":"2026-10-01","kind":"new","title":"...","sub":"...","source":"...","sections":[...]}'
export async function POST(req: NextRequest) {
  const denied = checkIngestAuth(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = ingestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "提案の形式が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const incoming = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const result = await ingestProposals(incoming);
  return NextResponse.json(result, { status: 201 });
}

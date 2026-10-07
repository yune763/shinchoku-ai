import { NextRequest, NextResponse } from "next/server";
import {
  collectionIngestSchema,
  ingestReports,
} from "@/lib/collection-store";
import { ingestSchema, ingestProposals } from "@/lib/proposals-store";

export const dynamic = "force-dynamic";

// 外部に公開された collection.json / proposals.json を取得して取り込む。
// 毎日の自動実行(クラウドのCron / GitHub Actions等)から叩く想定。
//
// 設定(環境変数):
//   COLLECTION_URL  … 情報収集データ(JSON)のURL
//   PROPOSALS_URL   … 開発提案データ(JSON)のURL（任意）
//   CRON_SECRET     … 設定時は ?key=<値> または Authorization: Bearer が一致したときのみ許可
//
// 実行: GET/POST /api/collection/sync?key=<CRON_SECRET>
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const key = req.nextUrl.searchParams.get("key")?.trim();
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (key !== secret && bearer !== secret) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
  }

  const collectionUrl = process.env.COLLECTION_URL?.trim();
  const proposalsUrl = process.env.PROPOSALS_URL?.trim();
  if (!collectionUrl && !proposalsUrl) {
    return NextResponse.json(
      { error: "COLLECTION_URL / PROPOSALS_URL が未設定です" },
      { status: 400 },
    );
  }

  const result: Record<string, unknown> = { ranAt: new Date().toISOString() };

  if (collectionUrl) {
    result.collection = await syncOne(collectionUrl, (json) => {
      const parsed = collectionIngestSchema.safeParse(json);
      if (!parsed.success) throw new Error("情報収集データの形式が不正です");
      const arr = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
      return ingestReports(arr);
    });
  }
  if (proposalsUrl) {
    result.proposals = await syncOne(proposalsUrl, (json) => {
      const parsed = ingestSchema.safeParse(json);
      if (!parsed.success) throw new Error("開発提案データの形式が不正です");
      const arr = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
      return ingestProposals(arr);
    });
  }

  return NextResponse.json({ ok: true, ...result });
}

// 1つのURLを取得し、取り込み処理に渡す。失敗しても結果に理由を残す。
async function syncOne(
  url: string,
  ingest: (json: unknown) => Promise<unknown>,
): Promise<unknown> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { error: `取得失敗 ${res.status}` };
    const json = await res.json();
    return await ingest(json);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "同期に失敗しました" };
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

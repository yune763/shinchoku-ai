import { NextRequest, NextResponse } from "next/server";
import { recordCommit } from "@/lib/commit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  hash: z.string().min(1),
  subject: z.string().default(""),
  body: z.string().optional(),
  author: z.string().optional(),
  branch: z.string().optional(),
  files: z.array(z.string()).optional(),
});

// git の post-commit フックから叩かれる。コミットを作業中ゴールへ自動記録する。
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const result = await recordCommit(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}

import { NextRequest, NextResponse } from "next/server";
import { listApps, createApp, appInputSchema } from "@/lib/apps-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ apps: await listApps() });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = appInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const app = await createApp(parsed.data);
  return NextResponse.json({ app }, { status: 201 });
}

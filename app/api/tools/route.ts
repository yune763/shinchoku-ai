import { NextRequest, NextResponse } from "next/server";
import { listTools, createTool, toolInputSchema } from "@/lib/tools-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tools: await listTools() });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = toolInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const tool = await createTool(parsed.data);
  return NextResponse.json({ tool }, { status: 201 });
}

import { NextResponse } from "next/server";
import { listGoals } from "@/lib/store";
import { buildProjectContext, projectContextReadme } from "@/lib/context";

export const dynamic = "force-dynamic";

// AIが「いまどこから始めるか」を自分で把握するための全体コンテキスト。
export async function GET() {
  const goals = await listGoals();
  const context = buildProjectContext(goals);
  return NextResponse.json({ readme: projectContextReadme(), ...context });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listTasksSplit, listGoalTargets } from "@/lib/chat-tasks";
import { learningStats } from "@/lib/task-learn";

export const dynamic = "force-dynamic";

// 右ペイン用：今日/明日以降のタスク、タスク追加先ゴール候補、学習状況。
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });
  const [{ today, upcoming }, goals, stats] = await Promise.all([
    listTasksSplit(),
    listGoalTargets(),
    learningStats(),
  ]);
  return NextResponse.json({ today, upcoming, goals, stats });
}

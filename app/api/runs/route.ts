import { NextResponse } from "next/server";
import {
  anyRunning,
  resumePendingRun,
  runningTargets,
  reapStaleRuns,
} from "@/lib/claude-runner";

export const dynamic = "force-dynamic";

// 実行中の Claude Code があるか＋実行中の対象ゴール一覧（ツリーの自動更新・実行中表示用）。
// あわせて、応答の途絶えた実行を回収し、クラッシュ等で中断した実装を「続きから」自動再開する。
export async function GET() {
  reapStaleRuns(); // 応答なしのゾンビ実行を回収（自動再開のブロックを解除）
  await resumePendingRun().catch(() => {});
  return NextResponse.json({
    running: anyRunning(),
    targets: runningTargets(),
  });
}

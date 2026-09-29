import { NextResponse } from "next/server";
import { listGoals } from "@/lib/store";
import { exportSnapshot, readTeam } from "@/lib/team";
import { memberConfig, syncEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET: 自分の最新を書き出してから、全メンバーのスナップショットを返す。
export async function GET() {
  const goals = await listGoals();
  await exportSnapshot(goals);
  const members = await readTeam();
  return NextResponse.json({
    syncEnabled: syncEnabled(),
    me: memberConfig(),
    members,
  });
}

// POST: 手動同期（自分の進捗を今すぐ共有フォルダへ反映）。
export async function POST() {
  const goals = await listGoals();
  await exportSnapshot(goals);
  const members = await readTeam();
  return NextResponse.json({ ok: true, members });
}

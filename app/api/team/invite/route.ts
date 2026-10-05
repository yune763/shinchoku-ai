import { NextResponse } from "next/server";
import { memberConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// 社内PCを連携させるための「招待キー」を発行する。
// キーは共有フォルダ(TEAM_SYNC_DIR)を含み、参加側は join スクリプトに渡すだけで .env が整う。
export async function GET() {
  const { syncDir } = memberConfig();
  if (!syncDir) {
    return NextResponse.json(
      {
        error:
          "このPCで共有フォルダ(TEAM_SYNC_DIR)が未設定のため招待キーを発行できません。先にチーム連携を設定してください。",
      },
      { status: 400 },
    );
  }
  const payload = { v: 1 as const, syncDir };
  const key = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return NextResponse.json({
    syncDir,
    key,
    command: `npm run join -- ${key} "あなたの名前"`,
  });
}

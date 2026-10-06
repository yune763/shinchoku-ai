import { NextRequest, NextResponse } from "next/server";
import { startRun, getRun, RepoPathMissingError } from "@/lib/claude-runner";
import { getGoal } from "@/lib/store";
import { GOAL_STATUS } from "@/lib/types";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 現在の実行状況を返す（フロントがポーリングしてライブ表示する）。
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ run: null });
  return NextResponse.json({ run });
}

// Claude Code(headless)を起動する。実行中なら 409。
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  // Claude Code 連携済みアカウントのみ、システムからの直接実装を許可する。
  const user = await getCurrentUser();
  if (!user?.claudeLinked) {
    return NextResponse.json(
      {
        error:
          "このアカウントはClaude Code未連携のため、システムからの直接実装はできません。管理者に連携を依頼してください。",
      },
      { status: 403 },
    );
  }
  const rerun = new URL(req.url).searchParams.get("rerun") === "1";
  try {
    const run = await startRun(id, { rerun });
    if (!run) {
      const existing = getRun(id);
      if (existing?.status === "running") {
        return NextResponse.json(
          { error: "すでに実行中です", run: existing },
          { status: 409 },
        );
      }
      const goal = await getGoal(id);
      // 本当に存在しない場合だけ 404。
      if (!goal) {
        return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });
      }
      // 完了済みゴールは普通の実装では何も走らない → 「再実行」を案内する。
      if (goal.status === GOAL_STATUS.done) {
        return NextResponse.json(
          {
            error:
              "このゴールは完了済みです。もう一度走らせるには「再実行」を押してください。",
            canRerun: true,
          },
          { status: 409 },
        );
      }
      // 存在するが起動できなかった（別タスクが対象化中／直前の実行が残っている等）。
      // ※ ゾンビ実行は起動時に回収されるため、基本は数秒おいて再試行で解消する。
      return NextResponse.json(
        {
          error:
            "いま実装を開始できませんでした。進行中の別タスクがこのゴールを対象にしているか、直前の実行が残っている可能性があります。数秒おいて再度お試しください。",
          canRetry: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ run }, { status: 202 });
  } catch (e) {
    // 作業フォルダ未設定 → UIでフォルダ指定BOXを出す合図を返す。
    if (e instanceof RepoPathMissingError) {
      return NextResponse.json(
        { error: "作業フォルダを指定してください", needRepo: true },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "起動に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

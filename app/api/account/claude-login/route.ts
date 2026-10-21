import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// このPCで Claude Code CLI にログインする（未導入なら先に自動インストール）。
// ログインはブラウザ認証のため、サーバーがターミナルで `claude` を起動し、
// 続きは利用者がそのウィンドウで完了する。ローカル(win32/darwin)のみ。
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未ログイン" }, { status: 401 });

  const platform = process.platform;
  const cwd = process.cwd();

  try {
    if (platform === "win32") {
      // 未導入なら npm で導入 → claude を起動（/k で開いたまま）。
      const line =
        'where claude >nul 2>nul || npm install -g @anthropic-ai/claude-code & claude';
      spawn("cmd.exe", ["/c", "start", "", "cmd", "/k", line], {
        cwd,
        detached: true,
        stdio: "ignore",
      }).unref();
      return NextResponse.json({ ok: true, mode: "terminal" });
    }
    if (platform === "darwin") {
      // Terminal.app で新しいウィンドウを開き、未導入なら導入してから claude を起動。
      const shellLine =
        `cd '${cwd.replace(/'/g, "'\\''")}'; command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code; claude`;
      const osa = `tell application "Terminal"
  activate
  do script "${shellLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"
end tell`;
      spawn("osascript", ["-e", osa], { stdio: "ignore", detached: true }).unref();
      return NextResponse.json({ ok: true, mode: "terminal" });
    }
    // リモート(デプロイ)では利用者PCのターミナルを開けない。
    return NextResponse.json(
      {
        error:
          "この環境ではログインを起動できません。各自のPC（ローカル）で実行してください。",
      },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "起動に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

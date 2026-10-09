import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGoal, listGoals, ancestorsOf } from "@/lib/store";
import { buildConsultPrompt } from "@/lib/prompt";
import { Goal } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 対象→祖先の順で作業フォルダ(repoPath)を解決（子が未設定なら親のフォルダで動かす）。
function resolveRepoPath(goal: Goal, all: Goal[]): string {
  const clean = (v: string) => v.trim().replace(/^["']+|["']+$/g, "").trim();
  if (goal.repoPath && goal.repoPath.trim()) return clean(goal.repoPath);
  const chain = ancestorsOf(goal.id, all); // 上位→直近の親
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].repoPath && chain[i].repoPath.trim())
      return clean(chain[i].repoPath);
  }
  return "";
}

// 親タスクから、作業フォルダで開発ツール（Claude Code CLI / Cursor）を起動する。
// tool=claude（既定）: 指示文をファイルに書き出し、最初のメッセージでそれを読ませる。
// tool=cursor: 作業フォルダを Cursor で開く（指示文はクライアント側でコピー）。
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  // サーバーが利用者のPC上（＝localhost, win32）で動いている場合のみ、サーバーから直接
  // Claude/Cursor を起動できる。Render などリモート(Linux)では起動できないため、
  // 起動に必要なデータ(remote:true ＋ prompt / repoPath)を返し、ブラウザ側で起動させる。
  const isWindows = process.platform === "win32";

  const tool = new URL(req.url).searchParams.get("tool") === "cursor" ? "cursor" : "claude";
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });

  const all = await listGoals();

  // Cursor（実装用）は作業フォルダを開く。フォルダ未設定なら案内する。
  if (tool === "cursor") {
    const repoPath = resolveRepoPath(goal, all);
    if (!repoPath) {
      return NextResponse.json(
        { error: "作業フォルダが未設定です。先に作業フォルダを指定してください。", needRepo: true },
        { status: 400 },
      );
    }
    // リモート実行：クライアント側で cursor://file/<path> を開かせる。
    // 作業フォルダは利用者PCのパスなので、サーバー(別マシン)での存在チェックはしない。
    if (!isWindows) {
      return NextResponse.json({ ok: true, remote: true, tool: "cursor", repoPath });
    }
    if (!existsSync(repoPath)) {
      return NextResponse.json(
        { error: "作業フォルダが見つかりません。パスを確認してください。", needRepo: true },
        { status: 400 },
      );
    }
    try {
      const exe = path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "cursor",
        "Cursor.exe",
      );
      if (existsSync(exe)) {
        spawn(exe, [repoPath], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      } else {
        spawn("cmd.exe", ["/c", "start", "", "cursor", repoPath], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        }).unref();
      }
      return NextResponse.json({ ok: true, tool });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Cursor の起動に失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // claude（相談用）: Claude デスクトップアプリを起動し、相談用の指示文をクリップボードへコピーする。
  // ターミナルは開かない。文字化けを避けるため UTF-8 ファイルを Set-Clipboard で読む。
  try {
    const prompt = buildConsultPrompt(goal, all);
    // Mac：Claudeデスクトップアプリへ AppleScript で直接貼り付ける。
    if (process.platform === "darwin") {
      const launched = await openClaudeMac(prompt);
      return NextResponse.json({ ok: true, tool: "claude", launched, prompt });
    }
    // その他(Linux/デプロイ)：クライアント側でコピー＆表示（モーダル）。
    if (!isWindows) {
      return NextResponse.json({ ok: true, remote: true, tool: "claude", prompt });
    }
    const dir = path.join(os.tmpdir(), "shinchoku-claude");
    await fs.mkdir(dir, { recursive: true });
    const promptPath = path.join(dir, `consult-${id}.md`);
    await fs.writeFile(promptPath, prompt, "utf8");

    const launched = await openClaudeDesktop(promptPath);
    // prompt も返す（クライアント側でモーダル表示＝確実にコピーできるように）。
    return NextResponse.json({ ok: true, tool: "claude", copied: true, launched, prompt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Claude Code の起動に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Claude デスクトップアプリ(AppX)を起動し、相談用プロンプトをクリップボードへコピーする。
// 戻り値: デスクトップアプリを起動できたら true。
function openClaudeDesktop(promptPath: string): Promise<boolean> {
  // PowerShell: UTF-8でファイルを読み、Set-Clipboardでコピー。Claudeパッケージを探して起動。
  // UTF-8でファイルを読み Set-Clipboard でコピー → デスクトップアプリ起動 →
  // ウィンドウをアクティブ化して Ctrl+V を送り、入力枠に自動入力した状態にする。
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$txt = Get-Content -Raw -Encoding UTF8 -LiteralPath '${promptPath.replace(/'/g, "''")}'
if ($txt) { Set-Clipboard -Value $txt }
$p = Get-AppxPackage -Name 'Claude' | Select-Object -First 1
if ($p) {
  Start-Process ('shell:AppsFolder\\' + $p.PackageFamilyName + '!Claude')
  Add-Type -AssemblyName System.Windows.Forms
  $ws = New-Object -ComObject WScript.Shell
  # 起動（コールドスタート含む）を待ちつつ、Claudeウィンドウを前面化して貼り付け。
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    if ($ws.AppActivate('Claude')) { break }
  }
  Start-Sleep -Milliseconds 800
  $ws.AppActivate('Claude') | Out-Null
  Start-Sleep -Milliseconds 250
  # すでに開いている場合でも新規会話から始める（Ctrl+N = 新規チャット）。
  [System.Windows.Forms.SendKeys]::SendWait('^n')
  Start-Sleep -Milliseconds 800
  $ws.AppActivate('Claude') | Out-Null
  # 入力枠へ貼り付け。
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  [Console]::Out.Write('launched')
} else {
  [Console]::Out.Write('noapp')
}
`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true },
    );
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.on("close", () => resolve(out.includes("launched")));
    child.on("error", () => resolve(false));
  });
}

// Mac: Claude デスクトップアプリを起動し、相談文をクリップボード経由で入力枠へ貼り付ける。
// System Events のキーストロークには「アクセシビリティ」許可が必要（未許可なら false）。
function openClaudeMac(prompt: string): Promise<boolean> {
  const script = `on run argv
  set the clipboard to (item 1 of argv)
  try
    tell application "Claude" to activate
  on error
    return "noapp"
  end try
  delay 1.0
  tell application "System Events"
    keystroke "n" using command down
    delay 0.6
    keystroke "v" using command down
  end tell
  return "launched"
end run`;
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script, prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    child.on("close", () => resolve(out.includes("launched") && !err.trim()));
    child.on("error", () => resolve(false));
  });
}

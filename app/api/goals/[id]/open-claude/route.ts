import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGoal, listGoals, ancestorsOf } from "@/lib/store";
import { buildConsultPrompt } from "@/lib/prompt";
import { isMemberMode } from "@/lib/config";
import { Goal } from "@/lib/types";

export const dynamic = "force-dynamic";

// メンバーPC（開発ツール無効）ではプログラム編集につながる起動を拒否する。
const MEMBER_BLOCKED = { error: "このPCでは開発ツールは無効です", memberMode: true };

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
  if (isMemberMode()) return NextResponse.json(MEMBER_BLOCKED, { status: 403 });
  // サーバーが利用者のPC上（＝localhost, win32）で動いている場合のみ、サーバーから直接
  // Claude/Cursor を起動できる。Render などリモート(Linux)では起動できないため、
  // 起動に必要なデータ(remote:true ＋ prompt / repoPath)を返し、ブラウザ側で起動させる。
  const isWindows = process.platform === "win32";

  const toolParam = new URL(req.url).searchParams.get("tool");
  const tool =
    toolParam === "cursor"
      ? "cursor"
      : toolParam === "chatgpt"
        ? "chatgpt"
        : "claude";
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });

  const all = await listGoals();

  // ChatGPT（相談）: ChatGPT デスクトップアプリ（無ければブラウザ）を開き、新規チャットで
  // 相談用の指示文を入力欄に入れて“送るだけ”の状態にする（Claude と同じ挙動）。
  if (tool === "chatgpt") {
    const prompt = buildConsultPrompt(goal, all);
    // Mac：AppleScript で ChatGPT アプリ（無ければブラウザ）を開き、新規チャットの入力欄へ貼り付ける。
    if (process.platform === "darwin") {
      const mode = await openChatGPTMac(prompt); // "app" | "browser" | ""
      return NextResponse.json({ ok: true, tool: "chatgpt", mode, prompt });
    }
    // その他のリモート(Linux/デプロイ)はアプリを起動できないので、ブラウザURL＋相談文を返して
    // クライアント側で開く＆コピーする。
    if (!isWindows) {
      return NextResponse.json({
        ok: true,
        remote: true,
        tool: "chatgpt",
        url: "https://chatgpt.com/",
        prompt,
      });
    }
    try {
      const dir = path.join(os.tmpdir(), "shinchoku-chatgpt");
      await fs.mkdir(dir, { recursive: true });
      const promptPath = path.join(dir, `consult-${id}.md`);
      await fs.writeFile(promptPath, prompt, "utf8");
      const mode = await openChatGPT(promptPath); // "app" | "browser" | ""
      return NextResponse.json({ ok: true, tool: "chatgpt", mode, prompt });
    } catch (e) {
      const message = e instanceof Error ? e.message : "ChatGPT の起動に失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

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

// ChatGPT デスクトップアプリ（無ければ既定ブラウザ）を開き、相談文を入力枠へ入れる。
// アプリがある場合: 相談文をクリップボードへコピー → アプリ起動 → 新規チャット(Ctrl+N) →
//   貼り付け(Ctrl+V) まで行い、“送るだけ”にする。
// アプリが無い場合: ブラウザで chatgpt.com を開き、相談文はクリップボードへ（貼り付けて送信）。
// 戻り値: "app"（アプリに自動入力）/ "browser"（ブラウザを開いた）/ ""（失敗）。
function openChatGPT(promptPath: string): Promise<string> {
  const pp = promptPath.replace(/'/g, "''");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$ws = New-Object -ComObject WScript.Shell
$txt = Get-Content -Raw -Encoding UTF8 -LiteralPath '${pp}'
if ($txt) { Set-Clipboard -Value $txt }
# ChatGPT アプリを探す（Codex など他の OpenAI アプリは除外）。
$pkg = Get-AppxPackage | Where-Object { $_.Name -match 'ChatGPT' } | Select-Object -First 1
if ($pkg) {
  $appId = (Get-AppxPackageManifest $pkg).Package.Applications.Application.Id | Select-Object -First 1
  if (-not $appId) { $appId = 'App' }
  Start-Process ('shell:AppsFolder\\' + $pkg.PackageFamilyName + '!' + $appId)
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    if ($ws.AppActivate('ChatGPT')) { break }
  }
  Start-Sleep -Milliseconds 800
  $ws.AppActivate('ChatGPT') | Out-Null
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('^n')         # 新規チャット
  Start-Sleep -Milliseconds 900
  $ws.AppActivate('ChatGPT') | Out-Null
  [System.Windows.Forms.SendKeys]::SendWait('+{ESC}')     # 入力欄にフォーカス（ChatGPTのショートカット）
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait('^v')         # 貼り付け
  [Console]::Out.Write('app')
} else {
  # 既定ブラウザで新規チャットを開き、読み込みを待って入力欄へ貼り付ける。
  Start-Process 'https://chatgpt.com/'
  Start-Sleep -Seconds 5                                   # ページ読み込み待ち（コールド起動を考慮）
  [System.Windows.Forms.SendKeys]::SendWait('+{ESC}')     # 入力欄にフォーカス
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait('^v')         # 貼り付け
  [Console]::Out.Write('browser')
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
    child.on("close", () => resolve(out.trim()));
    child.on("error", () => resolve(""));
  });
}

// Mac: ChatGPT アプリ（無ければ既定ブラウザで chatgpt.com）を開き、新規チャットの入力欄へ
// 相談文を貼り付ける（コピペ不要にする）。キー入力の自動化には「アクセシビリティ」許可が必要。
// 未許可のときは設定画面を自動で開いて案内し、"denied" を返す（相談文はクリップボードにある）。
// 戻り値: "app" / "browser"（自動入力成功） / "denied"（許可が必要） / ""（その他失敗）。
function openChatGPTMac(prompt: string): Promise<string> {
  const script = `on run argv
  set the clipboard to (item 1 of argv)
  set mode to "browser"
  try
    tell application "ChatGPT" to activate
    set mode to "app"
  on error
    open location "https://chatgpt.com/"
  end try
  if mode is "app" then
    delay 2
  else
    delay 5
  end if
  tell application "System Events"
    if mode is "app" then
      keystroke "n" using command down
      delay 0.6
    end if
    keystroke "v" using command down
  end tell
  return mode
end run`;
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script, prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    child.on("close", () => {
      const e = err.trim();
      if (!e) return resolve(out.trim());
      // アクセシビリティ未許可（-1719 / assistive access）。設定を開いて許可を促す。
      if (/-1719|assistive|not allowed/i.test(e)) {
        spawn("open", [
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ]).on("error", () => {});
        return resolve("denied");
      }
      resolve("");
    });
    child.on("error", () => resolve(""));
  });
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

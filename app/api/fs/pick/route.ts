import { NextResponse } from "next/server";
import { execFile } from "node:child_process";

export const dynamic = "force-dynamic";

// ローカル運用前提（localhost／サーバー＝このPC）。
// Windows ネイティブの「フォルダーの参照」ダイアログ（エクスプローラー）を開き、
// 選ばれたフォルダの絶対パスを返す。キャンセル時は canceled:true。
//
// 注意: サーバーと同じマシンのデスクトップにダイアログが表示される。
// 個人のローカルツール用途でのみ使う。

const PICK_SCRIPT = `
# 日本語パスが文字化けしないよう、標準出力をUTF-8にする。
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = "作業フォルダを選択してください"
$dlg.ShowNewFolderButton = $true
# 最前面に出すためのダミーフォーム（戻り値をstdoutに漏らさないよう全てOut-Null）。
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
$top.ShowInTaskbar = $false
$top.WindowState = 'Minimized'
$top.Show() | Out-Null
$top.Focus() | Out-Null
$result = $dlg.ShowDialog($top)
$top.Close() | Out-Null
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dlg.SelectedPath)
}
`;

export async function POST() {
  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "この機能はWindowsでのみ利用できます" },
      { status: 400 },
    );
  }

  try {
    const selected = await runPicker();
    const path = selected.trim();
    if (!path) return NextResponse.json({ canceled: true });
    return NextResponse.json({ path });
  } catch (e) {
    const message = e instanceof Error ? e.message : "フォルダ選択に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PowerShell を STA で起動し、スクリプトは -EncodedCommand で安全に渡す。
function runPicker(): Promise<string> {
  // ダイアログ操作に時間がかかるため、タイムアウトは長めにとる。
  const encoded = Buffer.from(PICK_SCRIPT, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      { windowsHide: true, timeout: 300_000, maxBuffer: 1 << 20 },
      (err, stdout) => {
        if (err) {
          // タイムアウトやプロセス失敗。
          reject(err);
          return;
        }
        resolve(stdout ?? "");
      },
    );
  });
}

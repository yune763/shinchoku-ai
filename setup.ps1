# 進捗管理AI — メンバー用 自動セットアップ (Windows)
# 使い方(メンバー): PowerShell を開いて次の1行を実行するだけ。
#   irm https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1 | iex
#
# この1本で以下をまとめて行う:
#   1. 必要ソフトのインストール（Node.js / Git / Claude CLI）
#   2. 進捗管理AI本体の取得(git clone)と依存インストール(npm install)
#   3. 共有DB(Firestore)接続設定(.env)の作成
#   4. デスクトップに「進捗管理AIを起動」ショートカットを作成
# ※管理者権限は不要（winget のユーザースコープで入ります）。

$ErrorActionPreference = "Stop"
$RepoUrl   = "https://github.com/yune763/shinchoku-ai.git"
$InstallDir = Join-Path $HOME "shinchoku-ai"

function Say($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!] $msg"  -ForegroundColor Yellow }

# winget 実行後などに、現在のセッションのPATHを更新して新しいコマンドを使えるようにする。
function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Has($cmd) {
  $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

# winget でアプリを入れる（既に使えるなら何もしない）。
function Ensure-App($cmdName, $wingetId, $label) {
  if (Has $cmdName) { Ok "$label は既に入っています"; return }
  if (-not (Has "winget")) {
    throw "winget が見つかりません。Windows を最新に更新するか、$label を手動でインストールしてください。"
  }
  Say "$label をインストールします..."
  winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements --scope user
  Refresh-Path
  if (-not (Has $cmdName)) {
    Refresh-Path
    if (-not (Has $cmdName)) {
      Warn "$label のインストール後、このウィンドウでまだ認識されません。"
      Warn "一度PowerShellを閉じて開き直し、もう一度このコマンドを実行してください。"
      throw "$label のPATH反映待ち"
    }
  }
  Ok "$label を入れました"
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  進捗管理AI メンバー用セットアップ" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1) 必要ソフト -------------------------------------------------
Ensure-App "node" "OpenJS.NodeJS.LTS" "Node.js"
Ensure-App "git"  "Git.Git"           "Git"

# Claude CLI は npm で入れる（Node.js が必要なので後に）。
Say "Claude CLI を確認します..."
if (Has "claude") {
  Ok "Claude CLI は既に入っています"
} else {
  Write-Host "    npm install -g @anthropic-ai/claude-code ..."
  npm install -g "@anthropic-ai/claude-code"
  Refresh-Path
  if (Has "claude") { Ok "Claude CLI を入れました" }
  else { Warn "Claude CLI が認識されません。PowerShellを開き直すと使えることがあります。" }
}

# 2) 本体の取得 -------------------------------------------------
if (Test-Path (Join-Path $InstallDir ".git")) {
  Say "既存のインストールを更新します ($InstallDir)"
  git -C $InstallDir pull --ff-only
} else {
  Say "進捗管理AIを取得します -> $InstallDir"
  git clone $RepoUrl $InstallDir
}

Say "依存パッケージをインストールします（少し時間がかかります）..."
Push-Location $InstallDir
npm install
Pop-Location
Ok "本体の準備ができました"

# 3) 接続設定(.env) --------------------------------------------
$envPath = Join-Path $InstallDir ".env"
if (Test-Path $envPath) {
  Ok ".env は既にあります（設定は変更しません）"
} else {
  Say "共有データベース(Firestore)の接続設定を作成します"
  Write-Host "    管理者から受け取った『FIREBASE_SERVICE_ACCOUNT』の値（1行のJSON）を貼り付けてEnter。"
  Write-Host "    まだ手元に無ければ空のままEnter（後で .env に設定できます）。" -ForegroundColor Yellow
  $fb = Read-Host "FIREBASE_SERVICE_ACCOUNT"

  $lines = @(
    "# 共有データベース(Firestore)。全メンバーで同じ値にすると情報が共有されます。",
    "FIREBASE_SERVICE_ACCOUNT=$fb",
    "FIRESTORE_COLLECTION=shinchoku"
  )
  Set-Content -Path $envPath -Value $lines -Encoding utf8
  if ([string]::IsNullOrWhiteSpace($fb)) {
    Warn ".env を作成しました（Firebaseキーは未設定）。共有するには後で設定してください: $envPath"
  } else {
    Ok ".env を作成しました（共有DBに接続します）"
  }
}

# 4) 起動ショートカット ----------------------------------------
Say "デスクトップに起動ショートカットを作成します"
$startCmd = Join-Path $InstallDir "start.cmd"
$desktop  = [System.Environment]::GetFolderPath("Desktop")
$lnkPath  = Join-Path $desktop "進捗管理AIを起動.lnk"
try {
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($lnkPath)
  $sc.TargetPath = $startCmd
  $sc.WorkingDirectory = $InstallDir
  $sc.Description = "進捗管理AI を起動してブラウザで開く"
  $sc.Save()
  Ok "デスクトップに『進捗管理AIを起動』を作成しました"

  # 更新用ショートカットも作成。
  $updateCmd = Join-Path $InstallDir "update.cmd"
  $lnkUpd = Join-Path $desktop "進捗管理AIを更新.lnk"
  $sc2 = $ws.CreateShortcut($lnkUpd)
  $sc2.TargetPath = $updateCmd
  $sc2.WorkingDirectory = $InstallDir
  $sc2.Description = "進捗管理AI を最新版に更新する"
  $sc2.Save()
  Ok "デスクトップに『進捗管理AIを更新』を作成しました"
} catch {
  Warn "ショートカット作成に失敗しました。$startCmd を直接ダブルクリックしても起動できます。"
}

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host "  セットアップ完了！" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "次の手順:" -ForegroundColor Green
Write-Host "  1) 初回のみ Claude にログイン（Maxプラン）: ターミナルで  claude  と入力し指示に従う"
Write-Host "  2) デスクトップの『進捗管理AIを起動』をダブルクリック"
Write-Host "  3) ブラウザで http://localhost:3000 が開きます（自動で開かない場合は手動で）"
Write-Host ""
Write-Host "インストール先: $InstallDir"

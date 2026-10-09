# 進捗管理AI — メンバー用 自動セットアップ (Windows)
# 使い方(メンバー): PowerShell を開いて次の1行を実行するだけ。
#   irm https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1 | iex
#
# この1本で以下をまとめて行う:
#   1. 必要ソフトのインストール（Node.js / Git / Claude CLI）
#   2. 進捗管理AI本体の取得（git clone、無理ならZIP）と依存インストール(npm install)
#   3. 共有DB(Firestore)接続設定(.env)の作成
#   4. デスクトップに「進捗管理AIを起動 / 更新」ショートカットを作成
# ※必要ソフトの導入でUAC（管理者の確認）が出たら「はい」を選んでください。

# 途中の警告で全体を止めない（重要ステップは個別に確認する）。
$ErrorActionPreference = "Continue"
$RepoUrl    = "https://github.com/yune763/shinchoku-ai.git"
$ZipUrl     = "https://github.com/yune763/shinchoku-ai/archive/refs/heads/main.zip"
$InstallDir = Join-Path $HOME "shinchoku-ai"

# インストールの全ログをデスクトップに保存（失敗時の原因特定用）。
$LogFile = Join-Path ([System.Environment]::GetFolderPath("Desktop")) "shinchoku-install-log.txt"
try { Start-Transcript -Path $LogFile -Force | Out-Null } catch {}

function Say($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!] $msg"  -ForegroundColor Yellow }
function Has($cmd)  { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

# winget 等でインストール後、現在のセッションで新しいコマンドを使えるようにPATHを更新。
# 既知のインストール先も明示的に足して、PATH反映待ちで止まらないようにする。
function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $extra = @(
    (Join-Path $env:ProgramFiles 'nodejs'),
    (Join-Path $env:ProgramFiles 'Git\cmd'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'),
    (Join-Path $env:APPDATA 'npm')
  ) | Where-Object { $_ -and (Test-Path $_) }
  $env:Path = (@($machine, $user) + $extra) -join ';'
}

# コマンドの実体パスを解決（PATHに無くても既知の場所を探す）。
function Resolve-Exe($name, $candidates) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

# winget でアプリを入れる（既に使えるなら何もしない）。失敗しても止めず続行。
function Ensure-App($cmdName, $wingetId, $label) {
  if (Has $cmdName) { Ok "$label は既にあります"; return $true }
  if (-not (Has "winget")) {
    Warn "winget が無いため $label を自動導入できません。手動でインストールしてください。"
    return $false
  }
  Say "$label をインストールします...（UACの確認が出たら『はい』）"
  try {
    winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements | Out-Host
  } catch {
    Warn "$label の導入でエラーが出ましたが続行します。"
  }
  Refresh-Path
  if (Has $cmdName) { Ok "$label を入れました"; return $true }
  Warn "$label がこのウィンドウでまだ認識されません（続行します）。"
  return $false
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  進捗管理AI メンバー用セットアップ" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1) 必要ソフト -------------------------------------------------
Refresh-Path
$hadNode = Has "node"
$hadGit  = Has "git"
Ensure-App "node" "OpenJS.NodeJS.LTS" "Node.js" | Out-Null
Ensure-App "git"  "Git.Git"           "Git"     | Out-Null

# 必要ソフトを“今回”新しく入れた場合、同じ画面では npm 等がうまく動かないことがある。
# そのときは、PATHが反映された新しいウィンドウに自動で引き継いで続きを実行する（2段階）。
if (((-not $hadNode) -or (-not $hadGit)) -and -not $env:SHINCHOKU_PHASE2) {
  Say "必要ソフトの準備ができました。続きを新しいウィンドウで自動実行します。"
  Write-Host "    （新しい黒い画面が開きます。この画面は閉じて構いません）" -ForegroundColor Yellow
  $env:SHINCHOKU_PHASE2 = "1"
  try {
    Start-Process powershell -ArgumentList @(
      "-NoProfile","-ExecutionPolicy","Bypass","-NoExit","-Command",
      "irm https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1 | iex"
    )
  } catch {
    Warn "新しいウィンドウの起動に失敗しました。PowerShellを開き直して、もう一度インストールを実行してください。"
  }
  try { Stop-Transcript | Out-Null } catch {}
  Read-Host "このウィンドウは Enter で閉じられます"
  return
}

# npm は .cmd を優先して確実に呼ぶ（新規インストール直後の .ps1 解決で失敗しないように）。
function Resolve-Npm {
  $cands = @(
    (Join-Path $env:ProgramFiles 'nodejs\npm.cmd'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\npm.cmd')
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($cands) { return $cands[0] }
  $c = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $c = Get-Command npm -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}
$npmExe = Resolve-Npm
$gitExe = Resolve-Exe "git" @((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'))

# Claude CLI は npm で入れる（Node.js が必要なので後に）。
Say "Claude CLI を確認します..."
if (Has "claude") {
  Ok "Claude CLI は既にあります"
} elseif ($npmExe) {
  Write-Host "    $npmExe install -g @anthropic-ai/claude-code ..."
  & $npmExe install -g "@anthropic-ai/claude-code" 2>&1 | Out-Host
  Refresh-Path
  if (Has "claude") { Ok "Claude CLI を入れました" } else { Warn "Claude CLI は後で導入してください（起動後にターミナルで『npm install -g @anthropic-ai/claude-code』でも可）。" }
} else {
  Warn "Node.js(npm) が未認識のため、Claude CLI は後で導入してください。"
}

# 2) 本体の取得 -------------------------------------------------
if (Test-Path (Join-Path $InstallDir ".git")) {
  Say "既存のインストールを更新します ($InstallDir)"
  if ($gitExe) { & $gitExe -C $InstallDir pull --ff-only | Out-Host }
} elseif (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
  if ($gitExe) {
    Say "進捗管理AIを取得します(git) -> $InstallDir"
    & $gitExe clone $RepoUrl $InstallDir | Out-Host
  }
  # git が無い／失敗した場合は ZIP で取得（公開リポジトリなので認証不要）。
  if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
    Say "進捗管理AIをZIPで取得します -> $InstallDir"
    try {
      $zip = Join-Path $env:TEMP "shinchoku-ai.zip"
      $tmp = Join-Path $env:TEMP "shinchoku-ai-extract"
      Invoke-WebRequest -UseBasicParsing -Uri $ZipUrl -OutFile $zip
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
      Expand-Archive -Path $zip -DestinationPath $tmp -Force
      $inner = Join-Path $tmp "shinchoku-ai-main"
      if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
      Move-Item $inner $InstallDir
      Remove-Item $zip -Force -ErrorAction SilentlyContinue
      Ok "本体を取得しました（ZIP）"
    } catch {
      Warn "本体の取得に失敗しました。ネットワークを確認して、もう一度実行してください。"
    }
  }
} else {
  Ok "既存のフォルダを使用します ($InstallDir)"
}

if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
  Write-Host "`n本体の取得に失敗しました。ネットワーク接続を確認して、もう一度このインストールを実行してください。" -ForegroundColor Red
  Write-Host ("ログ: {0}" -f $LogFile) -ForegroundColor Yellow
  try { Stop-Transcript | Out-Null } catch {}
  try { Start-Process notepad $LogFile } catch {}
  Read-Host "Enterキーで終了します"
  return
}

# 3) 依存パッケージ ---------------------------------------------
if (-not $npmExe) { $npmExe = Resolve-Npm }
if ($npmExe) {
  Say "依存パッケージをインストールします（数分かかります）..."
  Push-Location $InstallDir
  & $npmExe install 2>&1 | Out-Host
  $npmCode = $LASTEXITCODE
  Pop-Location
  if ($npmCode -eq 0 -and (Test-Path (Join-Path $InstallDir 'node_modules'))) {
    Ok "本体の準備ができました"
  } else {
    Warn "依存インストールに失敗しました（code=$npmCode）。上の赤い行が原因です。"
    Warn "対処：このウィンドウを閉じ、新しいPowerShellを開いて次を実行してください："
    Write-Host ("    cd `"$InstallDir`"; npm install") -ForegroundColor Yellow
  }
} else {
  Warn "Node.js(npm) が未認識のため、依存インストールを後回しにします。"
  Warn "PowerShellを開き直してから、デスクトップの『進捗管理AIを更新』を実行してください。"
}

# 4) 接続設定(.env) --------------------------------------------
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

# 5) 起動 / 更新ショートカット ----------------------------------
Say "デスクトップにショートカットを作成します"
$startCmd = Join-Path $InstallDir "start.cmd"
$updateCmd = Join-Path $InstallDir "update.cmd"
$desktop  = [System.Environment]::GetFolderPath("Desktop")
try {
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut((Join-Path $desktop "進捗管理AIを起動.lnk"))
  $sc.TargetPath = $startCmd
  $sc.WorkingDirectory = $InstallDir
  $sc.Description = "進捗管理AI を起動してブラウザで開く"
  $sc.Save()
  Ok "デスクトップに『進捗管理AIを起動』を作成しました"

  $sc2 = $ws.CreateShortcut((Join-Path $desktop "進捗管理AIを更新.lnk"))
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
Write-Host "  3) ブラウザで http://localhost:3000 を開く（自動で開かない場合は手動で）"
Write-Host ""
Write-Host "インストール先: $InstallDir" -ForegroundColor Green
Write-Host ("ログ: {0}" -f $LogFile) -ForegroundColor DarkGray
try { Stop-Transcript | Out-Null } catch {}
Read-Host "Enterキーで閉じます"

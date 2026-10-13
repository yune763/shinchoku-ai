@echo off
REM 進捗管理AI を最新へ更新する（コード取得＋依存の再インストール）。
cd /d "%~dp0"
echo 進捗管理AI を更新しています...

REM git / npm がPATHに無ければ既定の場所を使う。
where git >nul 2>nul
if %errorlevel%==0 (set "GIT=git") else (set "GIT=%ProgramFiles%\Git\cmd\git.exe")
where npm >nul 2>nul
if %errorlevel%==0 (set "NPM=npm") else (set "NPM=%ProgramFiles%\nodejs\npm.cmd")

if exist ".git" (
  call "%GIT%" pull --ff-only
  if errorlevel 1 (
    echo 更新の取得に失敗しました。ネットワークや git の状態を確認してください。
    pause
    exit /b 1
  )
) else (
  echo このフォルダは git 管理ではないため、更新は再インストールで行ってください。
)

echo 依存パッケージを確認しています...
REM --include=dev で electron(アプリ版に必要) も確実に入れる。
call "%NPM%" install --include=dev

REM デスクトップアプリ版（ターミナルを出さずに起動）へ切り替える。
REM 既存の「進捗管理AIを起動」アイコン自体を electron 直接起動に差し替えるので、
REM 同じアイコンを押すだけでアプリ版が開く（新しいアイコンを探す必要なし）。
echo アプリ版へ切り替えています...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $root='%~dp0'.TrimEnd('\'); $exe=Join-Path $root 'node_modules\electron\dist\electron.exe'; $d=[Environment]::GetFolderPath('Desktop'); $w=New-Object -ComObject WScript.Shell; if(Test-Path $exe){ foreach($name in @('進捗管理AIを起動.lnk','進捗管理AI(アプリ).lnk')){ $s=$w.CreateShortcut((Join-Path $d $name)); $s.TargetPath=$exe; $s.Arguments='\"electron/main.js\"'; $s.WorkingDirectory=$root; $s.IconLocation=$exe; $s.Description='進捗管理AI（ターミナルなしのアプリ版）'; $s.Save() }; Write-Host '[OK] アプリ版に切り替えました（デスクトップの『進捗管理AIを起動』から開けます）' } else { Write-Host '[注意] electron 本体が見つかりません。ネットワークを確認し、もう一度この更新を実行してください。' }"

echo.
echo 更新が完了しました。デスクトップの『進捗管理AI(アプリ)』から起動してください。
pause

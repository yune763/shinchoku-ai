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

REM デスクトップアプリ版（ターミナルを出さずに起動）のショートカットを作成/更新する。
echo アプリ版ショートカットを設定しています...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $root='%~dp0'.TrimEnd('\'); $exe=Join-Path $root 'node_modules\electron\dist\electron.exe'; if(Test-Path $exe){ $d=[Environment]::GetFolderPath('Desktop'); $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path $d '進捗管理AI(アプリ).lnk')); $s.TargetPath=$exe; $s.Arguments='\"electron/main.js\"'; $s.WorkingDirectory=$root; $s.IconLocation=$exe; $s.Description='進捗管理AI（ターミナルなしのアプリ版）'; $s.Save(); Write-Host 'デスクトップに『進捗管理AI(アプリ)』を作成しました' } else { Write-Host 'electron がまだ入っていません。もう一度この更新を実行してください。' }"

echo.
echo 更新が完了しました。デスクトップの『進捗管理AI(アプリ)』から起動してください。
pause

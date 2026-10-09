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
call "%NPM%" install
echo.
echo 更新が完了しました。アプリを起動し直してください。
pause

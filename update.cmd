@echo off
REM 進捗管理AI を最新へ更新する（コード取得＋依存の再インストール）。
cd /d "%~dp0"
echo 進捗管理AI を更新しています...
git pull --ff-only
if errorlevel 1 (
  echo 更新の取得に失敗しました。ネットワークや git の状態を確認してください。
  pause
  exit /b 1
)
echo 依存パッケージを確認しています...
call npm install
echo.
echo 更新が完了しました。アプリを起動し直してください。
pause

@echo off
REM 進捗管理AI ランチャー: アプリを起動し、ブラウザで開く。
cd /d "%~dp0"
echo 進捗管理AI を起動しています... (このウィンドウは開いたままにしてください)
REM 起動完了を待ってからブラウザを開く（数秒後に自動オープン）。
start "" /min cmd /c "timeout /t 6 >nul & start http://localhost:3000"
npm run dev

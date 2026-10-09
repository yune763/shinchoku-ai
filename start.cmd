@echo off
REM 進捗管理AI ランチャー: アプリを起動し、ブラウザで開く。
cd /d "%~dp0"
echo 進捗管理AI を起動しています... (このウィンドウは開いたままにしてください)

REM npm がPATHに無ければ既定の場所を使う。
where npm >nul 2>nul
if %errorlevel%==0 (set "NPM=npm") else (set "NPM=%ProgramFiles%\nodejs\npm.cmd")

REM 起動完了を待ってからブラウザを自動で開く。
start "" /min cmd /c "timeout /t 6 >nul & start http://localhost:3000"

call "%NPM%" run dev
echo.
echo アプリが終了しました。ウィンドウを閉じて構いません。
pause

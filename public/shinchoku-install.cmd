@echo off
REM 進捗管理AI ワンクリックインストーラ
REM これをダブルクリックすると、必要ソフトと本体をまとめて自動セットアップします。
title 進捗管理AI インストール
echo ============================================
echo   進捗管理AI をインストールします
echo ============================================
echo しばらくお待ちください（数分かかります）...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1 | iex"
echo.
echo 処理が終了しました。このウィンドウは閉じて構いません。
pause

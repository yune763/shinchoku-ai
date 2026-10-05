@echo off
rem 進捗管理AI 同期タスク（タスクスケジューラから呼ばれる）
cd /d "C:\Users\nejig\OneDrive\Desktop\claude code\進捗管理AI"
"C:\Program Files\nodejs\node.exe" scripts\sync.mjs >> data\sync.log 2>&1

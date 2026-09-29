# 進捗管理AI — Claude Code / Cursor 連携ルール

このプロジェクトは「進捗管理AI」本体であり、**開発の進捗をこのシステム自身で管理**します。
Claude Code / Cursor は、以下の流れで進捗を把握して作業してください。

## セッション開始時（最初にやること）
1. `shinchoku` MCP の `get_context` を呼ぶ（未起動なら `curl -s http://localhost:3000/api/context`）。
   - SessionStart フックで自動表示される場合は、その内容を前提にする。
2. `recommendedNext[0]` を「次に着手すべきゴール」として把握する。`waitingForHuman` は人待ちなので着手しない。

## 作業の進め方
1. 着手するゴールを `set_active_goal` で「作業中」に設定する
   （以後の git コミットが自動でそのゴールに記録される）。
2. `get_goal` の `prompt` に従い、**現在地のステップ**から続きを進める。
3. 節目でコミットする。コミットメッセージ規約:
   - 通常: `<内容>`（作業中ゴールへ自動記録）
   - ステップ完了: 末尾に `[done]`（現在ステップを自動で完了に）
   - 宛先を明示: `[goal:<goalId>]`
4. コミットしない小さな進捗は `add_log`（kind: ai_result）で記録、ステップ完了は `set_step_done`。

## 使えるMCPツール（shinchoku）
`get_context` / `list_goals` / `get_goal` / `add_log` / `set_step_done` / `update_goal` / `set_active_goal`

## スラッシュコマンド
`/progress`（現在地サマリ） `/pickup`（続きから着手） `/active-goal <名前>`（作業中設定）
`/goal-status <名前>`（状況まとめ） `/done-step`（現在ステップ完了）

## 原則
- 前提の再説明は不要。取得した文脈がそのまま前提。
- 人の作業待ちになったら、その旨を明示して止める。
- アプリ（http://localhost:3000）が未起動なら `npm run dev` を案内する。

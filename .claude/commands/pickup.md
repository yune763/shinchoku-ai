---
description: 次に着手すべきゴールから、続きの作業を始める
argument-hint: <任意: ゴール名の一部>
---

進捗管理AIの文脈に従って、続きから作業を始めてください。

1. 対象ゴールを決める:
   - 引数があれば `list_goals` で「$ARGUMENTS」に一致するものを選ぶ。
   - 無ければ `get_context` の `recommendedNext[0]`（`waitingForHuman` は避ける）。
2. `set_active_goal` で対象を作業中に設定（コミットが自動記録されるようにする）。
3. `get_goal` の `prompt` を読み、**現在地のステップ**から実際に作業を進める。
4. 進めた内容は `add_log`（kind: ai_result）で記録し、ステップを終えたら `set_step_done` で完了にする。
5. 人の作業待ちになったら、その旨を明示して止める。

前提の再説明は不要です。取得した文脈がそのまま前提です。

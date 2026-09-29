---
description: 作業中ゴールを設定（以後のコミットが自動記録される宛先）
argument-hint: <ゴール名の一部 または goalId>
---

「$ARGUMENTS」を作業中ゴールに設定してください。

1. `list_goals` で全ゴールを取得し、「$ARGUMENTS」に一致するものを探す。
   - 引数が空なら `get_context` の `recommendedNext[0]` を対象にする。
   - 複数一致・曖昧なら候補を提示して確認する。
2. `set_active_goal` に対象の goalId を渡して設定する。
3. 設定できたら「これで、以後のコミットがこのゴールへ自動記録されます」と伝える。

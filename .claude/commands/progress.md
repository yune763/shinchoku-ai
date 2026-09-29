---
description: 進捗管理AIの現在地サマリ（次に着手すべきゴール・人待ち）を表示
---

進捗管理AIの全体状況を確認して要約してください。

1. `shinchoku` MCP の `get_context` を呼ぶ（無ければ `curl -s http://localhost:3000/api/context`）。
2. 次を簡潔にまとめる:
   - サマリ（全ゴール数 / 未完了 / 完了）
   - **AIが次に着手すべき** `recommendedNext` の上位（タイトルと現在ステップ）
   - **人待ち** `waitingForHuman` があれば列挙
3. 「次にやるなら recommendedNext[0]」を一言で提案。

アプリ（http://localhost:3000）が起動していない場合は、その旨を伝えて `npm run dev` を案内してください。

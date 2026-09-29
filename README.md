# 進捗管理AI

Addness の考え方（ゴールベースの業務基盤）に着想を得た、**ローカルで動く進捗管理システム**。
※ Addness とは連携しません。独立して動きます。

## コンセプト

1. **ゴールを階層で置く** … 会社ゴール → プロジェクト → 今日のToDo
2. **文脈を貯める** … 各ゴールに「目的・現状・完了の基準・経緯・成果物」を蓄積
3. **AIに続きを頼む** … ゴールの文脈をまとめた指示文を生成し、Claude Code / Codex などに貼るだけで「続きから」作業できる

## 主な画面

- `/dashboard` … 会社ゴールの進捗サマリ
- `/goals` … ゴール一覧（階層で管理・追加。「したいこと」を入力）
- `/goals/[id]` … ゴール詳細（文脈・**ロードマップ**・**AIに計画を書かせる**・**完了レビュー**・**AIに依頼する**）
- `/goals/[id]/status` … 状況まとめ（人が一目で把握。道のり・現在地・完了基準・直近の動き）
- `/goals/[id]/guide` … 作業ガイド（人向け。チェックボックス＋リンクで完了/未完をAIに伝える）
- `/today` … 今日のToDo（末端タスクの一覧）
- `/team` … チームの現在地（担当者ごとのタスクと現在ステップ）
- `/ai-context` … AIコンテキスト（Claude Code が把握して続きから動くための入口）

## AIが「把握して動く」仕組み

- **ロードマップ（ステップ）**: 各ゴールに順序付きステップ。担当は AI / 人。進捗はステップ完了率から自動算出。最初の未完了が「現在地」。
- **完了の基準をAIが下書き**: 「したいこと」から完了基準＋ステップを生成（`/api/goals/{id}/plan`）。確認して適用。
- **完了レビュー**: 完了時に「やったこと・成果・申し送り」を記録（`/api/goals/{id}/review`）。
- **人のガイド**: 人担当ステップをチェックで完了にすると、AI側の「人待ち」判定が解ける。

### AI向けAPI（Claude Code が読む）

- `GET /api/context` … 全体サマリ ＋ `recommendedNext`（AIが次に着手すべき）／`waitingForHuman`
- `GET /api/goals/{id}/context` … ゴール個別のコンテキスト ＋ 指示文
- `GET /api/goals/{id}/prompt` … 続きから作業する指示文
- `POST /api/goals/{id}/logs` … 結果を記録
- `PATCH /api/goals/{id}/steps/{stepId}` … ステップ完了（`{"done":true}`）

`/ai-context` の「Claude Code にこれを渡すだけ」をコピーして貼れば、AIが自分で現在地を把握し、続きから進めます。

## 起動

```bash
npm install
npm run dev
```

→ http://localhost:3000

初回起動時、`data/store.json` にサンプルデータ（新サービスを届ける）が自動投入されます。

## 技術スタック

- Next.js (App Router) / TypeScript (strict) / Tailwind CSS / Zod
- データはローカル JSON（`data/store.json`）。DBサーバ不要。

## 中核：「AIに依頼する」の仕組み

ゴール詳細の「🤖 AIに依頼する」を押すと、`lib/prompt.ts` が
そのゴールの **祖先チェーン（何のために）・目的・現状・完了の基準・子タスク・これまでの経緯**
をまとめた指示文を生成します。これをAIエージェントに渡せば、前提の説明なしに続きを進められます。

## チーム利用（各PCローカル ＋ 進捗を共有）

構成の考え方：
- **各自のPCにこのシステムを入れて動かす**（`npm run dev`）。
- **そのPCの Cursor / Claude Code は、ローカルの自分の進捗管理とだけ連携**（MCPを localhost に向ける。外部へは送らない）。
- **進捗スナップショットを共有フォルダに書き出し、メンバー同士で読み合う** → お互いの進捗が見える（サーバー不要・API送信なし）。

```
[自分のPC]  Cursor/Claude Code ─(MCP:localhost)→ このアプリ ─→ data/store.json
                                                        │ 書き込みのたび
                                                        ▼
                                          共有フォルダ(OneDrive等)/members/<id>.json  ←→ 同期
                                                        ▲
[相手のPC]  Cursor/Claude Code ─(MCP:localhost)→ このアプリ ─→ members/<相手id>.json
```

### 1. 自分のPCのAIをローカル連携（MCP）

`.mcp.json`（プロジェクト直下）に登録するか `claude mcp add`。**BASE_URL は localhost**：

```bash
claude mcp add shinchoku -- node ./mcp/server.mjs
#  既定で SHINCHOKU_BASE_URL=http://localhost:3000 に接続（自分のアプリだけ）
```

Cursor も MCP対応（設定の MCP に同じ `node .../mcp/server.mjs` を登録）。
AIが使えるツール：

| ツール | 用途 |
|---|---|
| `get_context` | 自分の全体を把握し、次に着手すべきゴールを知る |
| `list_goals` | ゴール一覧（id・状態・進捗） |
| `get_goal` | ゴールの文脈＋続きから作業する指示文 |
| `add_log` | 作業結果・コメント・成果物を記録 |
| `set_step_done` | ステップ完了（進捗は自動再計算） |
| `update_goal` | 現状・状態・進捗を更新 |

AIがローカルで進めた結果は `data/store.json` に入り、**書き込みのたびに共有フォルダへ自動反映**されます。

### 2. メンバー同士で進捗を共有（共有フォルダ同期）

全員で同じ共有フォルダ（OneDrive / Dropbox / Google Drive / Git 等）を用意し、各PCの `.env` に設定：

```bash
cp .env.example .env
# .env に記入（MEMBER_ID は人ごとに必ず別の値）
#   MEMBER_ID=tanaka
#   MEMBER_NAME=田中
#   TEAM_SYNC_DIR=C:\Users\you\OneDrive\共有\shinchoku-team
```

- 各PCは自分の進捗を `TEAM_SYNC_DIR/members/<MEMBER_ID>.json` に書き出します。
- 共有フォルダの同期で、他メンバーのファイルが自分のPCにも届きます。
- アプリの **「メンバー」ページ** に全員の進捗（上位ゴールの%・進行中タスクの現在地）が並びます。手動更新は「今すぐ同期」。

> 補足: この方式はサーバーもAPI公開も不要で、既存の同期フォルダに乗るだけ。個人開発/小規模チーム向けです。同時書き込みの厳密な整合や大規模運用が必要になったら、共有DB（Prisma+PostgreSQL）＋ログイン認証への移行を推奨します。

## 今後の拡張候補

- MCP サーバ化（AIエージェントが直接ゴールを読み書き）
- 認証・組織/権限（複数人・アクセス制御）
- 実DB（Prisma + PostgreSQL）への移行
- KPIツリー / ルーティン自動生成 / 議事録取り込み

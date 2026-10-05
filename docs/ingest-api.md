# 取り込みAPI仕様（クラウドから push する用）

開発提案・情報収集は、**クラウド側から進捗管理AIの取り込みAPIへ JSON を POST** することで更新されます。
アプリ内では生成されません。本日分が出ない＝このPOSTが届いていない、という意味です。

## 前提：到達性
ローカルPCの `http://localhost:3000` は**インターネットからは見えません**。クラウドから push するには次のいずれかが必要です。
- トンネルで公開（例: Cloudflare Tunnel / ngrok）→ 得られた公開URLをクラウド側のPOST先にする。
- もしくはアプリ自体をクラウド/サーバーで常時稼働させる。

## 認証（推奨・公開する場合は必須）
`.env` に `INGEST_TOKEN` を設定すると、一致するトークンを持つPOSTだけ許可されます（未設定なら誰でも可＝ローカル専用）。

```
INGEST_TOKEN=220fa8b71e7231160c9efa5b13558cbb7a4496ffb95eb081
```

クラウド側は次のどちらかのヘッダでトークンを送ります。
```
Authorization: Bearer <INGEST_TOKEN>
# もしくは
x-ingest-token: <INGEST_TOKEN>
```
不一致/未提示は `401` を返します。

---

## 1. 開発提案  `POST /api/proposals/ingest`
- 1件のオブジェクト、または配列を受け付けます。
- `id` が既存なら**更新**、無ければ**追加**。保存は `date` 降順。
- 成功時 `201` と `{ added, updated, total, addedIds }`。

### JSON 形
```jsonc
{
  "id": "2026-10-01-foo",        // 必須・一意。日付始まり推奨
  "date": "2026-10-01",          // 必須。YYYY-MM-DD
  "kind": "new",                 // "improve" | "new" | "ai" | "other"（既定 other）
  "title": "提案タイトル",         // 必須
  "sub": "一言サマリ",            // 任意
  "source": "出典や根拠",         // 任意
  "sections": [                   // 任意。本文ブロック
    {
      "h": "見出し",
      "body": [
        "ただの段落テキスト",
        { "callout": "強調ボックス" },
        { "list": ["箇条書き1", "箇条書き2"] },
        { "steps": ["手順1", "手順2"] },
        { "metrics": [ { "n": "42%", "l": "指標ラベル" } ] }
      ]
    }
  ]
}
```

### 例（curl）
```bash
curl -X POST https://<公開URL>/api/proposals/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -d '[{"id":"2026-10-01-foo","date":"2026-10-01","kind":"new","title":"...","sub":"...","sections":[]}]'
```

---

## 2. 情報収集  `POST /api/collection/ingest`
- 1件のオブジェクト、または配列を受け付けます。
- **同じ `date` は差し替え**、無ければ追加。`topicCount` は `topics.length` で自動計算。
- 成功時 `201` と `{ added, updated, total }`。

### JSON 形
```jsonc
{
  "date": "2026-10-01",          // 必須・キー。YYYY-MM-DD
  "title": "本日の情報収集",       // 任意
  "summary": "全体サマリ",         // 任意
  "topics": [                     // トピック配列
    {
      "section": "カテゴリ名",
      "title": "トピック見出し",    // 必須
      "stars": 4,                 // 重要度（数値）
      "reason": "注目理由",
      "summary": "要約",
      "sources": [
        { "label": "媒体名", "title": "記事名", "url": "https://..." }
      ]
    }
  ]
}
```

### 例（curl）
```bash
curl -X POST https://<公開URL>/api/collection/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -d '{"date":"2026-10-01","title":"本日の情報収集","topics":[]}'
```

---

## 補足：既存の pull 同期（scripts/sync.mjs）
push に切り替えるなら `sync.mjs` と Task Scheduler のタスクは不要です（URL未設定だと毎回スキップするだけで害はありません）。
もし将来 pull に戻す場合は `scripts/sync.config.json` に `proposalsUrl` / `collectionUrl` を設定してください。

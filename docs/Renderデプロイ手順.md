# 進捗管理AI を Render に無料デプロイ（固定URL・データ永続）

ゴール: **固定URL**（例 `https://shinchoku-ai.onrender.com`）で常時アクセスでき、
再起動してもデータが消えない状態にする。費用は **無料**（Render無料プラン + Firestore無料枠）。

> 仕組み: Render の無料ディスクは揮発性だが、本アプリは `FIREBASE_SERVICE_ACCOUNT` が
> 設定されていれば保存先を Firestore に切り替える（`lib/blob.ts`）。これでデータが永続化する。

---

## 手順1. Firestore（データ保存先）の鍵を取得する — 無料枠
1. https://console.firebase.google.com で対象プロジェクトを開く（無ければ作成）。
2. **Firestore Database** を開き、まだなら **データベースを作成**（本番 or テストモードどちらでも可。
   サーバーからはサービスアカウントで接続するためセキュリティルールの影響は受けない）。
3. ⚙️ **プロジェクトの設定** → **サービス アカウント** タブ → **新しい秘密鍵を生成** → JSON をダウンロード。
4. そのJSONの中身を**丸ごと1つの文字列**として控える（後で環境変数 `FIREBASE_SERVICE_ACCOUNT` に貼る）。
   - Renderの環境変数欄にはJSONをそのまま（改行含む）貼り付けてOK。

## 手順2. GitHub にこのリポジトリを上げる
Render は GitHub 連携でデプロイする。まだ remote が無いので、自分のGitHubにリポジトリを作って push する。

1. https://github.com/new で空のリポジトリを作成（例 `shinchoku-ai`、Private可）。READMEは追加しない。
2. このフォルダで（PowerShell）:
   ```powershell
   git add -A
   git commit -m "Render対応: 保存層をblob化(Upstash Redis)・デプロイ設定を追加"
   git branch -M main
   git remote add origin https://github.com/<あなた>/shinchoku-ai.git
   git push -u origin main
   ```

## 手順3. Render でデプロイ — 無料・カード不要
1. https://render.com にサインアップ（GitHubログイン推奨）。
2. **New +** → **Blueprint** を選び、手順2のリポジトリを接続。
   - リポジトリ直下の `render.yaml` を自動検出して `shinchoku-ai`（Web / free）が作られる。
   - Blueprint を使わない場合: **New + → Web Service** を選び、
     Build Command=`npm install && npm run build` / Start Command=`npm run start:render` を指定。
3. **Environment**（環境変数）に手順1の値を設定:
   | Key | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | 手順1のサービスアカウントJSONの中身を丸ごと貼る |
   | （任意）`FIRESTORE_COLLECTION` | 保存先コレクション名（既定 `shinchoku`） |
   | （任意）`API_TOKEN` | 外部アクセスを閉じたい場合のみ設定 |
4. **Create / Deploy**。数分でビルド＆公開される。
5. 発行された **固定URL**（例 `https://shinchoku-ai.onrender.com`）をメモ。これが**社内に配る恒久URL**。

## 手順4. 動作確認
- ブラウザで `https://<発行URL>/` を開く → 進捗画面が出る。
- `https://<発行URL>/api/context` が JSON を返す。
- ゴールを1つ作る → Render を手動 Restart → **データが残っていれば永続化成功**。

---

## 社内メンバーの接続（この固定URLに向ける）
`docs/チーム接続ガイド.md` の公開URLを、この **Render固定URL** に置き換えて配布すればOK。
```
node scripts/connect.mjs https://shinchoku-ai.onrender.com "名前"
```

## 注意・既知の制約（無料プラン）
- **スリープ**: 無料Webサービスは約15分アクセスが無いとスリープし、次の初回アクセスで**起動に最大1分**ほどかかる（コールドスタート）。データは消えない。常に即応させたいなら有料($7/月)。
- **Firestore無料枠(Sparkプラン)**: 1GB保存 / 読み5万・書き2万 per日。本用途では十分。
  なお1ドキュメント上限は約1MiB（各JSON塊を1ドキュメントに保存。巨大化したら分割/DB移行を検討）。
- これ以降 **あなたのPCの `npm run dev` / cloudflared は不要**（Renderが常時ホストする）。Cloudflare Tunnel は停止してよい。
- URLを閉じたい場合は Render に `API_TOKEN` を設定 → メンバーは接続時に `SHINCHOKU_TOKEN` を渡す。

# 進捗管理AI を Render に無料デプロイ（固定URL・データ永続）

ゴール: **固定URL**（例 `https://shinchoku-ai.onrender.com`）で常時アクセスでき、
再起動してもデータが消えない状態にする。費用は **無料**（Render無料プラン + Upstash Redis無料プラン、どちらもカード不要）。

> 仕組み: Render の無料ディスクは揮発性だが、本アプリは `UPSTASH_REDIS_REST_URL/_TOKEN` が
> 設定されていれば保存先を Upstash Redis に切り替える（`lib/blob.ts`）。これでデータが永続化する。

---

## 手順1. Upstash（データ保存先）を作る — 無料・カード不要
1. https://upstash.com にサインアップ（GitHub/Googleログイン可）。
2. **Redis** → **Create Database**。
   - Name: 任意（例 `shinchoku`）
   - Type: Regional / Region: Japan（近い所）
   - 無料プランのまま作成。
3. データベース画面の **REST API** セクションから次の2つをコピーして控える:
   - `UPSTASH_REDIS_REST_URL`（`https://xxxx.upstash.io`）
   - `UPSTASH_REDIS_REST_TOKEN`（長い文字列）

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
   | `UPSTASH_REDIS_REST_URL` | 手順1でコピーしたURL |
   | `UPSTASH_REDIS_REST_TOKEN` | 手順1でコピーしたトークン |
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
- **Upstash無料枠**: 256MB / 50万コマンド/月。本用途（小さいJSON）では十分。
- これ以降 **あなたのPCの `npm run dev` / cloudflared は不要**（Renderが常時ホストする）。Cloudflare Tunnel は停止してよい。
- URLを閉じたい場合は Render に `API_TOKEN` を設定 → メンバーは接続時に `SHINCHOKU_TOKEN` を渡す。

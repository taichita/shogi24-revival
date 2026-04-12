# R24将棋道場 — デプロイ手順

## アーキテクチャ

```
[Vercel]  ← Next.jsクライアント (静的 + SSR)
    ↕ Socket.IO (WebSocket)
[Render]  ← Express + Socket.IO サーバー (永続プロセス)
    ↕
[SQLite]  ← サーバー内ファイル (data/shogi24.db)
```

Vercel は WebSocket の常時接続をサポートしないため、サーバーは Render (または Railway, Fly.io) に置く。

---

## 1. GitHubリポジトリを作成

`app/` フォルダの内容を新しいリポジトリにpush。

```bash
cd app
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/your-user/shogi24-revival.git
git push -u origin main
```

## 2. サーバーをRenderにデプロイ

1. https://render.com → New Web Service
2. リポジトリを接続
3. 設定:
   - **Root Directory**: `packages/server`
   - **Build Command**: `npm install && cd ../engine && npm install && npm run build && cd ../server`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. 環境変数:
   - `PORT` = `10000`（Renderのデフォルト）
   - `ALLOWED_ORIGINS` = `https://your-app.vercel.app`

→ デプロイ後、`https://shogi24-server.onrender.com` のようなURLが得られる

## 3. クライアントをVercelにデプロイ

1. https://vercel.com → New Project → リポジトリを接続
2. 設定:
   - **Root Directory**: `packages/client`
   - **Framework**: Next.js (自動検出)
   - **Build Command**: `cd ../engine && npm install && npm run build && cd ../client && npm run build`
   - **Install Command**: `npm install`
3. 環境変数:
   - `NEXT_PUBLIC_SERVER_URL` = `https://shogi24-server.onrender.com`

→ デプロイ後、`https://your-app.vercel.app` が得られる

## 4. CORS設定の更新

Render側の `ALLOWED_ORIGINS` を Vercel の本番URLに更新。

---

## ローカル開発

```bash
cd app
npm install
npm run build:engine
npm run dev          # サーバー(3025) + クライアント(3024) 同時起動
```

## データ

- **SQLite**: `packages/server/data/shogi24.db`
  - Renderの無料プランはディスクが永続でないため、再デプロイ時にDBリセットされる
  - 永続化が必要になったら Render の有料プラン(Disk) か PostgreSQL に移行

## 将来: Google認証

1. Google Cloud Console でOAuthクライアントID取得
2. `passport-google-oauth20` をサーバーに追加
3. DBの `users` テーブルに `google_id` カラム追加
4. クライアントのログイン画面を「Googleでログイン」ボタンに変更

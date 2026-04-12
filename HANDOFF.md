# R24将棋道場 — 引き継ぎ書

## プロジェクト概要
オンライン将棋対局サイト。将棋倶楽部24のオマージュ。
- リポジトリ: `C:\Life\shogi24-revival`（GitHub: taichita/shogi24-revival）
- モノレポ: engine（ルール）/ server（Express+Socket.IO+SQLite）/ client（Next.js 16）
- デプロイ: Vercel（client）+ Render（server）

## 現在のURL
- Client: https://shogi24-revival-client.vercel.app
- Server: https://shogi24-revival.onrender.com

## 実装済み機能
- ✅ 将棋対局（合法手判定、時間制御、レーティング）
- ✅ ロビー（待機室、挑戦、オートマッチ）
- ✅ 棋譜表示（全手記録）+ コピーボタン
- ✅ チャット（対局中テキストチャット）
- ✅ Google OAuth認証 + JWT + レーティング永続化
- ✅ ハンドル名ログイン（レガシー、Google未使用時）
- ✅ 感想戦モード（ローカル/自分盤/相手盤の3モード切替）

## 環境変数（Render側に設定済み）
- `PORT` = 10000
- `ALLOWED_ORIGINS` = https://shogi24-revival-client.vercel.app
- `GOOGLE_CLIENT_ID` = （Render環境変数に設定済み）
- `GOOGLE_CLIENT_SECRET` = （Render環境変数に設定済み）
- `JWT_SECRET` = （Render環境変数に設定済み）
- `SERVER_URL` = https://shogi24-revival.onrender.com
- `CLIENT_URL` = https://shogi24-revival-client.vercel.app

## 実装済み残タスク（2026-04-12完了）

### 1. ✅ サービス名リネーム「R24将棋道場」
- layout.tsx, page.tsx, online/page.tsx, DEPLOY.md の表示名を一括変更

### 2. ✅ Google認証後のハンドル名設定
- DB: `handle` をNULL許容に変更、`setUserHandle()` 関数追加
- サーバー: `auth.needsHandle` イベント（handle未設定時）、`auth.setHandle` イベント追加
- クライアント: `needsHandle` 状態でハンドル名入力画面を表示

### 3. ✅ 同一Googleアカウント重複ログイン防止
- サーバー: `userIdToSocketId` マップで管理、JWT認証時に既存接続をkick
- クライアント: `auth.kicked` イベントで「別タブでログインされました」表示

### 4. ✅ UI配置の大幅変更（将棋倶楽部24風レイアウト）
- 持ち駒: 縦表示（`vertical` prop）、相手=左上、自分=右下
- 棋譜: 盤面の左に配置
- チャット: 画面下部のバー形式に変更
- ロビーサイドバー: 対局中も右側にプレイヤー一覧表示（`LobbySidebar` 新コンポーネント）

### 5. ✅ Renderスリープ対策
- `GET /` → `ok`、`GET /health` → JSON（uptime含む）追加
- UptimeRobot等で `/health` を14分おきにpingする設定が必要（外部設定）

## 次のタスク候補
- UptimeRobotの設定（`https://shogi24-revival.onrender.com/health` を14分間隔で監視）
- 観戦モードの実装
- PostgreSQL移行（Renderリデプロイ時のDB消失対策）
- Vercelプロジェクト名の変更検討

## 技術メモ
- ローカル開発: `npm run dev`（server:3025 + client:3024）
- ビルド: `npm run build`
- push → Vercel/Render自動デプロイ
- DB: sql.js（SQLiteインメモリ、`packages/server/data/shogi24.db` に保存）
- Renderの無料プランはリデプロイでDBリセットされる（将来はPostgreSQL移行検討）

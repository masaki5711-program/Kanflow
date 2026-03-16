# Kanflow

アジャイル・スクラムチームのためのプロジェクト管理ツール。
IceBox → Product Backlog → Sprint → Release のライフサイクルをWebアプリで一元管理します。

## 機能一覧

| 機能 | 説明 |
|------|------|
| **プロジェクト管理** | 複数プロジェクト対応、メンバー管理 (PO/SM/Dev)、カテゴリ分類 |
| **IceBox** | 要望・アイデアの収集。3セクション (未確認/確認済み/凍結)、ファイル添付・画像プレビュー |
| **プロダクトバックログ** | ユーザーストーリー管理、優先順位並び替え、業務負荷点数、検索フィルタ |
| **スプリント管理** | カンバンボード、バーンダウンチャート、カレンダー、レビュー・振り返り |
| **リリース管理** | バージョン管理、一括リリース、PBI取り込み |
| **ダッシュボード** | プロジェクト概要、ゴール管理、ファイル添付（フォルダ管理）、スプリント進捗 |
| **レポート** | プロジェクトレポート生成・PDF印刷 |
| **多言語対応** | 日本語 / English / Bahasa Indonesia |

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| バックエンド | Next.js API Routes |
| ORM | Prisma 7 |
| データベース | MySQL 8.0 (Docker) |
| 認証 | NextAuth.js v5 (JWT) |
| ドキュメント編集 | Collabora Online / OnlyOffice (WOPI, オプション) |

## 前提条件

- **Node.js** >= 20
- **npm** >= 10
- **Docker Desktop** (MySQL用)
- **Git**

## セットアップ手順

### 1. リポジトリをクローン

```bash
git clone https://gitlab.scm.service.infosys.yamaha.com/ymma/stragegic-planning/appications/kanflow.git
cd kanflow
```

### 2. Docker でデータベースを起動

```bash
# .env ファイルを作成（ルートディレクトリ）
cp .env.example .env
# .env を編集してパスワードを設定してください

# MySQL + Collabora を起動
docker compose up -d
```

`.env` の設定例:

```env
MYSQL_ROOT_PASSWORD=your-strong-root-password
MYSQL_APP_USER=scrum_app
MYSQL_APP_PASSWORD=your-strong-app-password
MYSQL_DATABASE=scrum_tool
COLLABORA_ADMIN_PASSWORD=your-collabora-password
```

### 3. アプリケーションのセットアップ

```bash
cd app

# .env ファイルを作成
cp .env.example .env
```

`app/.env` を編集:

```env
# Database
DATABASE_URL="mysql://scrum_app:your-strong-app-password@localhost:3306/scrum_tool"
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=scrum_app
DATABASE_PASSWORD=your-strong-app-password
DATABASE_NAME=scrum_tool

# NextAuth （必ず変更してください）
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=ここにランダム文字列を設定  # openssl rand -base64 32 で生成
```

### 4. 依存関係のインストール

```bash
npm install
```

### 5. データベースのマイグレーション

```bash
# スキーマをDBに反映
npx prisma db push

# Prisma Client 生成
npx prisma generate
```

### 6. 初期管理者ユーザーの作成

```bash
npx tsx scripts/create-admin.ts
```

> スクリプトが存在しない場合は、以下のコマンドでDBに直接作成:
> ```bash
> npx tsx -e "
> const { PrismaClient } = require('./src/generated/prisma');
> const bcrypt = require('bcryptjs');
> const p = new PrismaClient();
> (async () => {
>   const hash = await bcrypt.hash('admin123', 12);
>   await p.user.create({ data: { name: 'Admin', email: 'admin@example.com', password: hash, role: 'admin' }});
>   console.log('Admin created: admin@example.com / admin123');
>   await p.\$disconnect();
> })();
> "
> ```

### 7. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 にアクセスしてください。

## ディレクトリ構成

```
kanflow/
├── README.md
├── docker-compose.yml       # MySQL + Collabora
├── .env.example             # Docker用環境変数テンプレート
├── app/
│   ├── .env.example         # アプリ用環境変数テンプレート
│   ├── package.json
│   ├── prisma.config.ts
│   ├── next.config.ts
│   ├── prisma/
│   │   └── schema.prisma    # データベーススキーマ
│   ├── public/
│   │   ├── logo.svg         # Kanflow ロゴ
│   │   └── favicon.svg
│   └── src/
│       ├── app/             # Next.js App Router ページ
│       │   ├── login/       # ログイン画面
│       │   ├── projects/    # プロジェクト詳細
│       │   │   └── [projectId]/
│       │   │       ├── icebox/    # IceBox管理
│       │   │       ├── backlog/   # バックログ管理
│       │   │       ├── sprints/   # スプリント管理
│       │   │       ├── releases/  # リリース管理
│       │   │       ├── settings/  # プロジェクト設定
│       │   │       └── report/    # レポート
│       │   ├── admin/       # 管理者画面
│       │   ├── settings/    # ユーザー設定
│       │   └── api/         # API Routes
│       ├── components/      # 共通コンポーネント
│       └── lib/             # ユーティリティ、i18n、認証
└── scripts/                 # ユーティリティスクリプト
```

## 権限モデル

| 操作 | PO | SM | Dev |
|------|:--:|:--:|:---:|
| IceBox 新規追加 | o | o | o |
| IceBox ステータス変更 | o | - | - |
| バックログ 編集・並び替え | o | - | - |
| スプリント 作成 | o | o | - |
| スプリント タスク更新 | o | o | o |
| リリース 管理 | o | - | - |
| プロジェクト 作成・編集 | o | o | - |
| メンバー 招待 | o | o | - |

## 本番デプロイ

### Docker で本番起動

```bash
cd app
npm run build
npm start
```

### 環境変数の注意事項

- `NEXTAUTH_SECRET` は必ずランダムな値を設定 (`openssl rand -base64 32`)
- `DATABASE_PASSWORD` は強力なパスワードを使用
- 本番では `NEXTAUTH_URL` を実際のドメインに変更

## トラブルシューティング

| 症状 | 原因と対策 |
|------|-----------|
| `ECONNREFUSED 3306` | Docker の MySQL が起動していない → `docker compose up -d` |
| `prisma generate` エラー | `npx prisma db push` を先に実行 |
| ログインできない | 管理者ユーザーが未作成 → 手順6を実行 |
| `.next` ビルドエラー | `rm -rf .next && npm run dev` でキャッシュクリア |

## ライセンス

社内専用ツール

# Kanflow

<div align="center">
  <img src="app/public/logo.svg" alt="Kanflow Logo" width="80" height="80">
  <h3>Agile Project Management Tool</h3>
  <p>IceBox → Product Backlog → Sprint → Release のライフサイクルをWebアプリで一元管理</p>
</div>

---

## 機能一覧

### コアモジュール

| 機能 | 説明 |
|------|------|
| **ダッシュボード** | プロジェクト概要、プロダクトゴール管理、ファイル管理（フォルダ対応）、スプリント進捗、レポート出力 |
| **IceBox** | 要望・アイデアの収集。3セクション（未確認/確認済み/凍結）。ファイル添付・画像プレビュー、記入者設定、検索フィルタ |
| **プロダクトバックログ** | ユーザーストーリー（誰が/何を/なぜ）、受入条件、業務負荷点数、優先順位並び替え、検索フィルタ |
| **スプリント管理** | PBI取り込み、タスク管理、キャパシティゲージ、ステータスワークフロー（計画→実行→レビュー→完了→アーカイブ）、レビューコメント・振り返りメモ |
| **リリース管理** | バージョン管理、一括リリース、PBI取り込み、リリースノート |

### 可視化ツール

| 機能 | 説明 |
|------|------|
| **ガントチャート** | スプリント→PBI→タスクのツリー表示、ズーム切替（週/2週/月）、進捗バー、今日マーカー、自動スクロール |
| **カレンダー** | 月表示 / 週表示 / チーム表示の3モード。ドラッグでイベント作成、スプリント期間バー、タスク締切バッジ、ミニカレンダー |
| **バーンダウンチャート** | 計画線・理想線・実績線の3本表示、スプリント期間ハイライト |
| **レポート** | プロジェクト全体レポート、PDF印刷対応 |

### プロジェクト管理

| 機能 | 説明 |
|------|------|
| **マルチプロジェクト** | プロジェクト作成・アーカイブ、カテゴリ分類（右クリックで割当） |
| **プロジェクトタイプ** | システム開発 / 工程改善 / その他の3タイプ。ラベルが自動変更 |
| **メンバー管理** | PO / SM / Dev のロール設定、メンバー招待 |
| **ファイル管理** | フォルダ作成・名前変更・削除、ファイル移動、ドキュメント編集（Collabora Online） |
| **ユーザー管理** | 管理者がユーザー作成・編集・無効化・パスワードリセット |

### UI/UX

| 機能 | 説明 |
|------|------|
| **多言語対応** | 日本語 / English / Bahasa Indonesia（プロジェクト単位で切替） |
| **プロフェッショナルUI** | 統一SVGアイコン、グラデーション、ガラス効果、アニメーション |
| **カスタム確認ダイアログ** | ネイティブconfirm()の代わりにアプリ内モーダル |
| **レスポンシブ** | サイドバーナビゲーション、セクション分け（MAIN / TOOLS / SETTINGS） |

### セキュリティ

| 機能 | 説明 |
|------|------|
| **認証** | NextAuth.js v5 (JWT)、Credentials認証 |
| **権限制御** | ロールベース (admin/member + PO/SM/Dev) |
| **セキュリティヘッダー** | CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy |
| **ファイル検証** | MIMEタイプ + マジックバイト検証、ファイル名サニタイズ |
| **入力検証** | 全APIエンドポイントでZodスキーマバリデーション |

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| バックエンド | Next.js API Routes (25+ エンドポイント) |
| ORM | Prisma 7 |
| データベース | MySQL 8.0 (Docker) |
| 認証 | NextAuth.js v5 (JWT) |
| ドキュメント編集 | Collabora Online (WOPI, オプション) |

## 前提条件

- **Node.js** >= 20
- **npm** >= 10
- **Docker Desktop** (MySQL + Collabora用)
- **Git**

## クイックスタート

```bash
# 1. クローン
git clone https://gitlab.scm.service.infosys.yamaha.com/ymma/stragegic-planning/appications/kanflow.git
cd kanflow

# 2. Docker起動 (MySQL + Collabora)
cp .env.example .env
# .env を編集してパスワードを設定
docker compose up -d

# 3. アプリセットアップ
cd app
cp .env.example .env
# app/.env を編集（DATABASE_URL, NEXTAUTH_SECRET, WOPI_ACCESS_TOKEN）
npm install
npx prisma db push
npx prisma generate

# 4. 初期管理者作成
node -e "
const { PrismaClient } = require('./src/generated/prisma');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('admin123', 12);
  await p.user.create({ data: { name: 'Admin', email: 'admin@example.com', password: hash, role: 'admin' }});
  console.log('Created: admin@example.com / admin123');
  await p.\$disconnect();
})();
"

# 5. 起動
npm run dev
# → http://localhost:3000
```

## 環境変数

### app/.env

```env
# Database
DATABASE_URL="mysql://scrum_app:PASSWORD@localhost:3306/scrum_tool"
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=scrum_app
DATABASE_PASSWORD=your-password
DATABASE_NAME=scrum_tool

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=               # openssl rand -base64 32

# Collabora Online
NEXT_PUBLIC_COLLABORA_URL=http://localhost:9980
WOPI_ACCESS_TOKEN=             # openssl rand -hex 32

# App URLs
APP_PUBLIC_URL=http://localhost:3000
APP_EXTERNAL_URL=http://host.docker.internal:3000
```

### ルート .env (Docker用)

```env
MYSQL_ROOT_PASSWORD=your-root-password
MYSQL_DATABASE=scrum_tool
MYSQL_APP_USER=scrum_app
MYSQL_APP_PASSWORD=your-app-password
COLLABORA_ADMIN_PASSWORD=your-collabora-password
```

## ディレクトリ構成

```
kanflow/
├── README.md
├── docker-compose.yml          # MySQL + Collabora Online
├── collabora-coolwsd.xml       # Collabora設定（SSL無効化済み）
├── .env.example                # Docker用環境変数テンプレート
└── app/
    ├── .env.example            # アプリ用環境変数テンプレート
    ├── package.json
    ├── next.config.ts          # CSP, セキュリティヘッダー
    ├── prisma/
    │   └── schema.prisma       # 17モデルのDBスキーマ
    ├── public/
    │   ├── logo.svg            # Kanflowロゴ
    │   └── favicon.svg         # ファビコン
    └── src/
        ├── app/
        │   ├── login/          # ログイン画面
        │   ├── admin/users/    # ユーザー管理（管理者専用）
        │   ├── settings/       # カテゴリ設定
        │   ├── projects/[projectId]/
        │   │   ├── page.tsx          # ダッシュボード
        │   │   ├── icebox/           # IceBox
        │   │   ├── backlog/          # プロダクトバックログ
        │   │   ├── sprints/          # スプリント管理
        │   │   │   └── components/   # SprintCard等の分割コンポーネント
        │   │   ├── releases/         # リリース管理
        │   │   ├── gantt/            # ガントチャート
        │   │   ├── calendar/         # カレンダー（月/週/チーム表示）
        │   │   ├── report/           # レポート
        │   │   ├── settings/         # プロジェクト設定
        │   │   └── editor/           # Collaboraドキュメントエディタ
        │   └── api/                  # 25+ API Routes
        ├── components/
        │   ├── header.tsx            # ヘッダー（パンくず、ナビ）
        │   ├── sidebar.tsx           # サイドバー（MAIN/TOOLS/SETTINGS）
        │   ├── confirm-dialog.tsx    # カスタム確認ダイアログ
        │   ├── burndown-chart.tsx    # バーンダウンチャート
        │   ├── collabora-editor.tsx  # Collabora統合
        │   └── user-management-base.tsx
        └── lib/
            ├── auth.ts               # NextAuth設定
            ├── i18n.ts               # 3言語翻訳（250+キー）
            ├── prisma.ts             # Prismaクライアント
            ├── api-helpers.ts        # 認証・権限ヘルパー
            ├── collabora.ts          # Collabora WOPI統合
            └── project-type-labels.ts # プロジェクトタイプ別ラベル
```

## 権限モデル

### プロジェクトロール

| 操作 | PO | SM | Dev |
|------|:--:|:--:|:---:|
| IceBox 新規追加 | ✓ | ✓ | ✓ |
| IceBox ステータス変更 | ✓ | - | - |
| バックログ 編集・並び替え | ✓ | - | - |
| スプリント 作成 | ✓ | ✓ | - |
| スプリント タスク更新 | ✓ | ✓ | ✓ |
| リリース管理・インポート | ✓ | - | - |
| プロジェクト 作成・編集 | ✓ | ✓ | - |
| メンバー 招待 | ✓ | ✓ | - |

### システムロール

| 操作 | admin | member |
|------|:-----:|:------:|
| ユーザー作成・編集・無効化 | ✓ | - |
| パスワードリセット | ✓ | - |
| 全プロジェクトのヘッダーメニュー表示 | ✓ | - |

## 本番デプロイ

### ビルド & 起動

```bash
cd app
npm run build
npm start
```

### 本番環境変数

```env
NEXTAUTH_URL=https://kanflow.your-domain.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXT_PUBLIC_COLLABORA_URL=https://collabora.your-domain.com
APP_PUBLIC_URL=https://kanflow.your-domain.com
APP_EXTERNAL_URL=https://kanflow.your-domain.com
WOPI_ACCESS_TOKEN=<openssl rand -hex 32>
```

### リバースプロキシ (nginx)

```nginx
# Kanflow アプリ
server {
    server_name kanflow.your-domain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Collabora Online（WebSocket対応必須）
server {
    server_name collabora.your-domain.com;
    location / {
        proxy_pass http://localhost:9980;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Collabora 本番設定

docker-compose.yml の `extra_params` を以下に変更:
```yaml
- "extra_params=--o:ssl.enable=true --o:ssl.termination=true"
- "aliasgroup1=https://kanflow.your-domain.com"
```

## トラブルシューティング

| 症状 | 原因と対策 |
|------|-----------|
| `ECONNREFUSED 3306` | Docker の MySQL が起動していない → `docker compose up -d` |
| `prisma generate` エラー | `npx prisma db push` を先に実行 |
| ログインできない | 管理者ユーザーが未作成 → クイックスタート手順4を実行 |
| `.next` ビルドエラー | `rm -rf .next && npm run dev` でキャッシュクリア |
| Collabora `SSL_ERROR` | `collabora-coolwsd.xml` でSSLが有効 → ローカルは`false`に設定 |
| Collabora `wss://` エラー | `docker compose down collabora && docker compose up -d collabora` |
| WOPI `401 Unauthorized` | `WOPI_ACCESS_TOKEN` が未設定 → `.env` に追加 |
| ファイルダウンロード 404 | `private/uploads/` にファイルが存在しない → 再アップロード |

## アイテムのライフサイクル

```
[要望発生]
    │
    ▼
IceBox (未確認)  ←── 誰でも投入可、ファイル添付可
    │
    ▼  (POレビュー)
IceBox (確認済み)  ── or ── IceBox (凍結)
    │
    ▼  (PBへ移行)
Product Backlog (Not Ready)
    │
    ▼  (詳細化・見積り完了)
Product Backlog (Ready)
    │
    ▼  (スプリントプランニング)
Sprint Backlog → タスク分解 → カンバン管理
    │
    ▼  (開発・テスト・受入)
Done → レビュー → 振り返り
    │
    ▼  (リリース判断)
Release Backlog (Staged → Released)
```

## ライセンス

社内専用ツール — YAMAHA Group

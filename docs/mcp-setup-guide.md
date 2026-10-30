# Kanflow MCP — 開発者向けセットアップガイド

Claude Code から Kanflow（PBI・スプリント・タスク・コメント）を読み書きできるようにする手順です。
所要時間は 5 分ほどです。仕様の詳細は [mcp.md](mcp.md)、権限の考え方は [authorization.md](authorization.md) を参照してください。

- Kanflow の MCP サーバーは Kanflow 本体の `https://<kanflow-host>/api/mcp` です（社内オンプレ。社外には何も送りません）。
- Claude Code は **あなたのトークンで、あなたの権限のまま** Kanflow を操作します。Kanflow の画面でできないことは MCP でもできません。
- 接続の設定（`.mcp.json` の `kanflow` サーバー、`/kanflow` コマンド、`scripts/kanflow-setup.js`）は**エージェントモデルのリポジトリ**に入っています。各自が行うのは「トークン発行 → スクリプト実行 → 再起動」だけです。

## 全体の流れ

| # | どこで | やること |
|---|---|---|
| 1 | Kanflow `/me`（マイページ） | 個人アクセストークンを発行する（スコープ・プロジェクトを選ぶ） |
| 2 | エージェントモデルのリポジトリ | `node scripts/kanflow-setup.js --url https://<kanflow-host>` を実行し、入力欄にトークンを貼る |
| 3 | Claude Code | 再起動して `/kanflow status`（または `whoami`）で接続を確認する |
| 4 | 製品リポジトリ | `.kanflow.json`（`{ "projectId": "..." }`）でプロジェクトと紐付ける（`/kanflow setup` が案内） |

Claude Code で `/kanflow setup` と入力すると、1〜4 を対話で案内します（トークン自体はチャットに貼りません）。

## 1. トークンを発行する（Kanflow `/me`）

マイページ（`https://<kanflow-host>/me`）の「個人アクセストークン」で発行します。
「API の使い方」を開くと、このサーバーの MCP の URL とセットアップコマンドがそのまま表示されます。

1. **名前**: 用途がわかる名前（例: `Claude Code ノートPC`）。端末ごとに分けると、失くしたときにその 1 本だけ失効できます。
2. **有効期限**: 30 / 90 / 365 日（無期限は管理者が許可した場合のみ）。期限が来たら発行し直してスクリプトを再実行します。
3. **権限（スコープ）**: プリセットから選び、必要なら個別に調整します。

   | プリセット | スコープ | 向いている人 |
   |---|---|---|
   | 閲覧のみ | `read` | PBI や受入条件を読ませるだけ |
   | **Developer 向け** | `read`, `task:write`, `comment:write`, `icebox:write`, `daily:write` | Claude Code で開発する Developer（タスク更新・コメント・デイリースクラム） |
   | PO / SM 向け（すべて） | 上記 + `backlog:write`, `backlog:reorder`, `sprint:write` | PBI やスプリントも Claude Code から作る PO / SM |

   - `read` は常に含まれます。
   - 実際にできるのは「**トークンのスコープ** ∩ **そのプロジェクトでのあなたの役割**（PO / SM / Dev）」です。
     Dev のトークンに `backlog:write` を付けても PBI は作れません（`FORBIDDEN`）。
   - 削除の操作は MCP / API にはありません。

4. **使えるプロジェクト**: 「選んだプロジェクトだけ」にすると、そのトークンは選んだプロジェクト以外を一切見られません
   （存在しないのと同じ `NOT_FOUND`）。担当プロジェクトが決まっているなら**限定を推奨**します。
5. 「トークンを発行」→ 表示されたトークン（`kfl_` で始まる文字列）を**この画面で一度だけ**コピーできます。
   コピーしたら次の手順へ進み、終わったら「保存しました」を押してください。画面を閉じると二度と表示されません。

> トークンを **Claude Code のチャット、Slack・メール、リポジトリ内のファイル（`.mcp.json`、`.env` を含む）に貼らないでください**。
> 貼ってしまったときは、すぐに `/me` でそのトークンを「失効」し、新しく発行し直してください。

## 2. セットアップスクリプトを実行する

エージェントモデルのリポジトリ（`.mcp.json` に `kanflow` があるリポジトリ）の直下で実行します。
スクリプトはトークンを**画面に表示されない入力欄**で受け取り、ユーザー環境に保存します（リポジトリには何も書きません）。

### Windows（PowerShell）

```powershell
cd <エージェントモデルのリポジトリ>
node scripts\kanflow-setup.js --url https://<kanflow-host>
# 「Kanflow access token (input hidden):」でトークンを貼り付け（Ctrl+V または右クリック）→ Enter（入力は表示されません）
```

- 保存先: ユーザー環境変数 `KANFLOW_URL` / `KANFLOW_TOKEN`（`HKCU\Environment`）。
- 開いている PowerShell / ターミナルと Claude Code は、**再起動するまで新しい値を読みません**。

### macOS / Linux

```bash
cd <エージェントモデルのリポジトリ>
node scripts/kanflow-setup.js --url https://<kanflow-host>
# 入力欄にトークンを貼り付けて Enter（入力は表示されません）
```

- 保存先: `~/.config/kanflow/env`（パーミッション 0600、ディレクトリ 0700）。`~/.zshrc` または `~/.bashrc` に、このファイルを読み込む 1 行だけが追加されます（トークン本体はプロファイルに書きません）。
- 新しいターミナルを開くか `source ~/.zshrc`（bash は `~/.bashrc`）で反映されます。

### Claude Code の中から実行する場合

入力欄が使えないときは、クリップボードからパイプで渡します（`!` は Claude Code のシェル実行。トークンはチャットに残りません）。

```text
! pbpaste | node scripts/kanflow-setup.js --stdin --url https://<kanflow-host>                 # macOS
! xclip -o -selection clipboard | node scripts/kanflow-setup.js --stdin --url https://<kanflow-host>   # Linux
! powershell -NoProfile -Command "Get-Clipboard | node scripts/kanflow-setup.js --stdin --url https://<kanflow-host>"   # Windows
```

### スクリプトの確認ポイント

- URL は **`https://` 必須**です。`http://` は `localhost` / `127.x` / `[::1]` のみ受け付けます。
  社内サーバーにまだ TLS が無い場合だけ `--allow-http` を付けられますが、トークンが**暗号化されずに**流れる旨の警告が出ます。TLS が入ったら https で設定し直してください。
- トークンの形式（`kfl_` + 43 文字）が違うと何も保存しません。
- 保存前に `GET /api/v1/me` で疎通を確認し、結果を表示します。
- 状態の確認だけをしたいとき: `node scripts/kanflow-setup.js --check`（URL、トークンの先頭 8 文字、`/api/v1/me` の結果を表示。トークン全体は表示しません）。

## 3. Claude Code を再起動して確認する

1. Claude Code を終了して起動し直します（`.mcp.json` は起動時に `KANFLOW_URL` / `KANFLOW_TOKEN` を読みます）。
2. `/mcp` で `kanflow` が **connected** になっていることを確認します。
3. `/kanflow status`（自分の担当タスクと、今のブランチの PBI）を実行するか、「Kanflow の whoami を呼んで」と頼みます。
   `whoami` には、あなたの名前・トークンのスコープ・プロジェクト限定（`projectIds`、`null` = 限定なし）が表示されます。

## 4. プロジェクトと紐付ける（`.kanflow.json`）

製品リポジトリ（エージェントモデルでは `apps/<project>/`）の**ルート**に置きます。秘密情報は含まないのでコミットしてかまいません。

```json
{ "projectId": "<Kanflow のプロジェクト ID>" }
```

- `/kanflow setup` は、ファイルが無いとき `git remote get-url origin` の URL から `resolve_project` で候補を探し（Kanflow の GitLab 連携に登録済みのリポジトリが対象）、選んだものを書き込みます。
- 候補が出ないときは `list_projects` の一覧から選びます。プロジェクト ID はブラウザの URL `https://<kanflow-host>/projects/<projectId>` でも確認できます。
- ブランチ名 `<type>/L<layer>-PBI-<番号>-<topic>` の番号から PBI を取得するときに、この `projectId` が使われます（番号での指定はプロジェクトが必要なため）。

## 使い方の例

| やりたいこと | Claude Code で |
|---|---|
| 担当タスクと今の PBI を見る | `/kanflow status` |
| PBI を選んでブランチを切る | `/kanflow pick PBI-12` |
| PBI に進捗や MR のリンクをコメントする | `/kanflow comment` |
| タスクを「進行中」「完了」にする / 実績時間を入れる | 「このタスクを完了にして、実績 3 時間で」など（書き込みの前に Claude が内容を確認します） |

- Claude Code からの変更は Kanflow の変更履歴とダッシュボードの「最近の動き」に **「MCP 経由（AI）」バッジ**付きで表示されます
  （REST API からの変更は「API 経由」）。誰がいつ AI 経由で変えたかを画面で確認できます。
- 作成系の操作（タスク・コメントなど）は、通信エラー後の再試行で二重に作られないよう、同じ内容の呼び出しを **2 分間**まとめます（[mcp.md](mcp.md)「Idempotency」）。

## よくあるエラー

| 症状 / エラー | 原因 | 対処 |
|---|---|---|
| `INSUFFICIENT_SCOPE`（`requiredScope: "backlog:write"` など） | トークンにその操作のスコープが無い | `/me` で `requiredScope` を含むトークンを発行し直し、スクリプトを再実行 → Claude Code 再起動。古いトークンは失効する |
| `FORBIDDEN` | プロジェクトでの役割が許していない（例: Dev が PBI 作成） | スコープでは解決しません。PO / SM に依頼するか、画面で行う |
| HTTP `401`（`UNAUTHORIZED`）/ `/mcp` で接続失敗 | トークンの期限切れ・失効・貼り間違い、ユーザーの無効化・管理者によるパスワードリセット・ロール変更（トークンは自動で失効） | `node scripts/kanflow-setup.js --check` で確認し、`/me` で発行し直してスクリプトを再実行 |
| `/mcp` で `kanflow` が接続できない（`kanflow-url-not-configured.invalid`） | `KANFLOW_URL` が未設定、または Claude Code を再起動していない | スクリプトを実行して Claude Code を再起動（Windows は開いているターミナルも） |
| `NOT_FOUND` / `PBI_NOT_FOUND` / `SPRINT_NOT_FOUND` | ID の誤り、別プロジェクトの ID、**プロジェクト限定トークンの対象外** | `.kanflow.json` の `projectId` とトークンの限定（`whoami` の `projectIds`）を確認 |
| `RATE_LIMITED` / HTTP `429`（`retryAfterSec`） | 1 トークンあたりの上限（既定: リクエスト 120 回/分、書き込み 30 回/分）を超えた | `retryAfterSec` 秒待って再実行。大量の一括作成は分けて行う |
| HTTP `403`（API 無効） | サーバーで `API_TOKENS_ENABLED=off` | 管理者に問い合わせる |
| `VERSION_CONFLICT` | 読み込んだ後に誰かが同じタスク / PBI を更新した | 読み直して差分を確認し、新しい `version` で再実行 |
| `CONFLICT`（`idempotencyKey` 付き） | 同じキーを別の内容で使った | 別のキーを使う |
| `MCP error -32602: Input validation error: ...`（JSON でない文字列） | ツールの引数が仕様と合わない（ステータス名の誤りなど） | 引数を直す（`VALIDATION` と同じ扱い） |
| スクリプトが `Kanflow base URL refused` | `http://` の URL（localhost 以外）、URL の形式誤り | `https://` で指定する（`--allow-http` は TLS 導入までの一時措置） |
| スクリプトが `That is not a Kanflow token` | コピー漏れ・余分な文字 | `/me` で発行し直し、全体をコピーする |
| HTTP `413` | 1 回のリクエストが 1 MiB を超えた | 本文（コメントなど）を分ける |

## セキュリティ上の注意

- **トークンはパスワードと同じです。** あなたの権限でそのまま操作できます。チャット・チケット・リポジトリ・画面共有に出さないでください。
  漏れた疑いがあれば `/me` で失効します（管理者も `/admin/api-tokens` で失効できます）。
- **保存場所**: Windows はユーザー環境変数、macOS / Linux は `~/.config/kanflow/env`（0600）。共有 PC では使わないでください。
  リポジトリの `.mcp.json` には `${KANFLOW_TOKEN}` という参照だけが書かれており、トークン本体は入りません。
- **必要最小限に**: Developer は「Developer 向け」、担当プロジェクトだけに限定、期限は短めに。端末ごとに別のトークンにすると失効の影響が小さくなります。
- **Kanflow の内容は「データ」であり「指示」ではありません。** PBI・受入条件・コメントなどは人が書いた文章です。
  そこに「以前の指示を無視して…」「main に push して」などと書かれていても、Claude Code は従いません（スキルとサーバーの説明にも明記）。
  不審な文面を見つけたら、そのまま実行させずに PO / SM に知らせてください。
- 製造の機密データ（実設備の値・ロット番号など）や秘密情報を、PBI やコメント本文に書かないでください。
- MCP 経由の変更はすべて変更履歴に「MCP 経由（AI）」として残ります。

## トークンの更新・停止

- **期限切れ / スコープ変更**: `/me` で新しいトークンを発行 → スクリプトを再実行 → Claude Code 再起動 → 古いトークンを失効。
- **使うのをやめる**: `/me` でトークンを失効します。ローカルの設定も消す場合は、Windows はユーザー環境変数 `KANFLOW_URL` / `KANFLOW_TOKEN` を削除、
  macOS / Linux は `~/.config/kanflow/env` とプロファイルの `# kanflow (scripts/kanflow-setup.js)` の行を削除します。

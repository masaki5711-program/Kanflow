# Kanflow 運用ランブック

本番 1 台構成（Windows 11, `D:\APP\Kanflow`）。管理者操作は「管理者として実行」した PowerShell で行います。

## 1. 構成と常駐物

| 役割 | 実体 | 起動方法 |
|------|------|----------|
| アプリ (Next.js) | Windows サービス **`kanflow.exe`**（表示名 "Kanflow", node-windows, ラッパー `ops\web\daemon`） → `next start -H 0.0.0.0 -p 3000` | 自動（ブート時） |
| ワーカー（翻訳キュー + AI 監視） | Windows サービス **`kanflowworker.exe`**（表示名 "kanflow-worker", ラッパー `ops\worker\daemon`） → `app\.next\worker\main.cjs`。`AI_TRANSLATION_WORKER=external` のときのみ必要（[worker.md](./worker.md)） | 自動 |
| DB | Windows サービス **`KanflowMySQL`**（MySQL 8.4, datadir `D:\APP\Kanflow\mysql-data\data`, `127.0.0.1:3306`） | 自動 |
| 文書編集 | Collabora コンテナ `kanflow-collabora`（Rancher Desktop, `docker-compose-collabora.yml`, :9980） | `start-collabora.bat` |
| ローカル AI | Ollama（:11434） | `setup\start-ollama.bat` |
| 監視 | タスク **`KanflowWatchdog`**（5 分毎 + 起動時, SYSTEM） | `ops\watchdog\register-watchdog-task.ps1` |
| バックアップ | タスク **`KanflowBackup`**（毎日 02:30） | `ops\backup\register-backup-task.ps1` |
| AI 監視レポート | タスク **`KanflowAiSurveillance`**（毎日 06:30）※ワーカー導入後は不要（§6） | `ops\surveillance\register-surveillance-task.ps1` |

レガシー（使わない）: `KanflowApp` タスク / `app\start-service.bat` / `service.log` / PM2（`legacy\pm2\`, `legacy\schtasks\` に移動済み）。

### ログの場所

| ログ | 場所 |
|------|------|
| アプリ stderr/stdout | `ops\web\daemon\kanflow.err.log` / `kanflow.out.log` / `kanflow.wrapper.log`（ラッパー移設前は `app\node_modules\next\dist\bin\daemon\`） |
| ワーカー | `app\logs\worker-YYYY-MM-DD.log`（60 秒ごとの `heartbeat`）、心拍ファイル `app\logs\worker-heartbeat.json`、ラッパー `ops\worker\daemon\kanflowworker.*.log` |
| watchdog | `ops\logs\watchdog.log`（正常時は何も書かない）、状態 `ops\logs\watchdog-state.json` |
| backup / restore | `ops\logs\backup.log`, `ops\logs\restore.log` |
| AI 監視実行 | `ops\logs\surveillance.log` |
| デプロイ | `ops\logs\deploy.log` |
| MySQL | `D:\APP\Kanflow\mysql-logs\error.log` |

`ops\logs\*.log`、`ai-activity.log`、daemon ログ（Web 新旧 + ワーカー）は watchdog 実行毎に 10 MB 超でローテーション（5 世代）されます。手動: `ops\logs\rotate-logs.ps1`。

全体の状態は `powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\status.ps1` で一覧できます
（サービス / :3000 / ヘルス / BUILD_ID / ワーカー心拍 / 翻訳滞留 / タスク / 最終バックアップ）。

## 2. ヘルスチェック

```
GET http://127.0.0.1:3000/api/health
200 {"status":"ok","db":"ok","ollama":"ok"|"unreachable",
     "worker":{"status":"ok"|"stale"|"absent","heartbeatAgeSec":12,"expected":true,"mode":"external"},
     "translation":{"pending":0,"oldestPendingAgeSec":null,"running":0,"failed":4},
     "uptime":123,"buildId":"<.next\BUILD_ID>"}
503 {"status":"error","db":"error",...}
```

- 認証不要・秘密情報なし。DB は `SELECT 1`（3 秒タイムアウト）、Ollama は `/api/tags`（2 秒、失敗しても 200 のまま）。
- `worker` / `translation` は情報のみ（ステータスコードに影響しない）。`worker.expected=true`（`AI_TRANSLATION_WORKER=external`）で
  `stale` / `absent` ならワーカー停止を疑う。watchdog が `kanflowworker.exe` を再起動します（15 分に 1 回まで）。
- **認証ミドルウェア / `src/proxy.ts` を追加する場合は `/api/health` を必ず除外**してください（リダイレクトされると watchdog が異常と判定し再起動します）。
- `/api/health` を含まない古いビルドでは watchdog は 404 を検知して `/api/auth/csrf` で代替判定します。

## 3. 再起動・復旧

### 通常の再起動 / 障害復旧

`recover.bat` をダブルクリック（UAC 承認）。内部で次を行います:

1. `kanflow.exe` を停止（45 秒で止まらなければラッパーを強制終了）
2. **ポート 3000 に残った node.exe を終了**（既知の問題: `Restart-Service kanflow.exe -Force` は孫プロセス `next start` を残すことがあり、EADDRINUSE ループ → 1067 停止になる）
3. 起動し、**LISTEN PID が変わったこと**と `/api/health` = 200 を確認
4. サービス/ポート/ヘルス/daemon ログ末尾を表示

状態表示のみ: `recover.bat /status`

`Restart-Service kanflow.exe` を直接使うのは避けてください。手動で行う場合:

```powershell
netstat -ano -p tcp | findstr :3000          # LISTENING の PID を確認
Stop-Service kanflow.exe -Force
Stop-Process -Id <残っていた PID> -Force
Start-Service kanflow.exe
netstat -ano -p tcp | findstr :3000          # PID が変わったことを確認
```

### watchdog の動作

5 分毎に `/api/health` を確認し、20 秒空けて **2 回連続失敗**したときだけ動きます。

- `db:"error"` かつ `KanflowMySQL` が停止 → MySQL を起動（アプリ再起動では直らないため）
- それ以外 → `recover.bat` と同じ手順で `kanflow.exe` を再起動
- 再起動は 15 分に 1 回まで（ループ防止）。それでも失敗が続くと `watchdog.log` に ERROR を出し続けるので手動対応
- ワーカー（`AI_TRANSLATION_WORKER=external` のときのみ）: `kanflowworker.exe` が停止中、または心拍ファイルが stale（3 分超）なら
  再起動（15 分に 1 回まで）。未導入なら 6 時間ごとに WARN を記録するだけ
- **メンテナンス中の一時停止**: `ops\watchdog\MAINTENANCE` ファイルを作成（6 時間経つと無視されます）

```powershell
New-Item D:\APP\Kanflow\ops\watchdog\MAINTENANCE -ItemType File   # 一時停止
Remove-Item D:\APP\Kanflow\ops\watchdog\MAINTENANCE                # 再開
```

## 4. デプロイ・ロールバック

**手順は [deploy.md](./deploy.md) だけに従ってください**（フェーズ A → C → B、事前チェック、読み取り専用のドリフト確認、
Web + ワーカーの同時入れ替え、自動ロールバック、データ面の注意）。要点:

```powershell
# 事前チェック（変更なし）→ 本番
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase A -PreflightOnly
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase A

# 直前のビルドへ戻す（Web + ワーカー。DB と .env は戻らない → deploy.md §6）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback
```

- ビルドは必ず別ディレクトリ（`.next-new`）へ。`next build` の後に同じ `NEXT_DIST_DIR` で `npm run build:worker`。
- `swap-build.ps1 -NewDir .next-prev` は拒否されます（ロールバック先の削除防止）。戻すときは `-Rollback`。
- 依存関係の入れ替え（`npm ci`）はサービスを止めたメンテナンス時間にのみ（deploy.md Phase C）。

## 5. Collabora

```powershell
start-collabora.bat                                           # 起動
docker compose -f docker-compose-collabora.yml up -d --force-recreate   # 設定変更後
docker exec kanflow-collabora sh -lc "env | grep alias"       # 反映確認
```

**注意**: `docker compose restart` / Rancher の再起動 / `docker start` は環境変数（`aliasgroupN`）を**読み直しません**。
アプリの URL/ホスト名（`APP_EXTERNAL_URL`）を変えたら必ず `--force-recreate` してください。
症状: Word/Excel を開くと「認識されていない WOPI ホストです」。

## 6. AI 監視レポート（KanflowAiSurveillance）

LLM を数分占有するため**業務時間外**に実行します（既定 06:30、始業 08:00 前に完了）。

```powershell
# 登録 / 時刻変更（管理者）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\surveillance\register-surveillance-task.ps1            # 06:30
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\surveillance\register-surveillance-task.ps1 -Time 19:00

# 手動実行（デモ）
ops\surveillance\run-ai-surveillance.bat /interactive        # demo\run-ai-surveillance.bat も同じ
```

- トークンは `app\.env` の `SURVEILLANCE_TOKEN` を実行時に読み込みます（スクリプトに埋め込まない）。
- 02:30（バックアップ）とは重ねないでください。
- **スタンドアロン ワーカー（`kanflow-worker`）を導入し、ワーカーが `SURVEILLANCE_SCHEDULE`（既定 06:30）で監視を実行する構成にした場合は、二重実行を避けるためタスクを削除**: `Unregister-ScheduledTask -TaskName KanflowAiSurveillance -Confirm:$false`

## 7. 定期点検チェックリスト

| 頻度 | 内容 |
|------|------|
| 毎朝 | 管理者で `ops\status.ps1` → `[OK] no warnings`（バックアップ結果、ワーカー心拍、翻訳滞留を含む）、`ops\logs\watchdog.log` に夜間の ERROR が無い |
| 毎週 | 保存先の空き容量、`weekly\` に世代が増えている |
| 四半期 | リストア訓練（[backup-restore.md §4](./backup-restore.md)） |
| 変更時 | ホスト名変更 → `.env` 更新 + Collabora `--force-recreate` |

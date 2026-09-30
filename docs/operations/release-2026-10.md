# リリース手順 2026-10（拡張ロードマップ + Next.js 16.3.7）

対象: ブランチ `feat/roadmap-2026-10`（Phase A 済みの本番へ）。評価: 回帰 216/216・受け入れ 8.2/10（`D:\APP\Kanflow-e2e\reports\`）。
すべて「管理者として実行」した PowerShell で行う。所要 30〜45 分（停止は C3 の約 10〜15 分）。

## 0. 事前（停止なし）

```powershell
cd D:\APP\Kanflow
git checkout -- ops\web\migrate-service-wrapper.ps1     # 一時パッチを破棄（ブランチ側に同じ修正あり）
git fetch --all 2>$null; git status                     # クリーンであること
powershell -NoProfile -ExecutionPolicy Bypass -File ops\status.ps1
```

## 1. Phase C1 — Web ラッパー移設（停止 約 1 分）

ブランチ版スクリプト（node-windows の stderr を致命扱いしない修正込み）を使う:

```powershell
git show feat/roadmap-2026-10:ops/web/migrate-service-wrapper.ps1 > $env:TEMP\mig-wrapper.ps1
# ※ $PSScriptRoot 依存のため、ops\web に一時配置して実行
Copy-Item $env:TEMP\mig-wrapper.ps1 ops\web\migrate-service-wrapper.ps1 -Force
powershell -NoProfile -ExecutionPolicy Bypass -File ops\web\migrate-service-wrapper.ps1
git checkout -- ops\web\migrate-service-wrapper.ps1
```

確認: `ops\status.ps1` → `web service wrapper : ops\web\daemon`、`/api/health` 200。

## 2. Phase C3 + 拡張デプロイ（メンテナンス 10〜15 分）

```powershell
cd D:\APP\Kanflow
git tag deploy-2026MMDD-roadmap feat/roadmap-2026-10   # ブランチは評価用 worktree で使用中のため
git checkout --detach deploy-2026MMDD-roadmap           # タグを detached で取り出す（deploy.ps1 は HEAD のタグを確認）
New-Item ops\watchdog\MAINTENANCE -ItemType File -Force
sc.exe stop kanflowworker.exe             # 未導入なら「存在しない」で可
sc.exe stop kanflow.exe                   # 止まらなければ recover.bat の手順で :3000 の node を終了
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\node-modules-snapshot.ps1 -Save
cd app; npm ci --no-audit --no-fund; cd ..
Remove-Item ops\watchdog\MAINTENANCE
# 事前チェック（変更なし）→ 本番。マイグレーション 7 本を適用
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\deploy.ps1 -Phase A -ApplyMigrations -PreflightOnly
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\deploy.ps1 -Phase A -ApplyMigrations
```

- マイグレーション（`docs/roadmap.md` の表の順）。FULLTEXT は `prisma migrate deploy` が 1 セッションで実行するので追加操作不要（検証 DB で確認済み）。
- 失敗時: `deploy.ps1` が自動ロールバック（ビルド）。DB が途中まで適用された場合は `backup-restore.md` でバックアップから復元し、`node-modules-snapshot.ps1 -Restore` → `swap-build.ps1 -Rollback`。

## 3. 移行後スクリプト（停止なし）

```powershell
cd D:\APP\Kanflow\app
node --import tsx scripts/migrate-assignees.ts            # dry-run → CSV 確認（検証時: 272 件、未解決 2 名）
node --import tsx scripts/migrate-assignees.ts --apply
node --import tsx scripts/heal-plan.ts                    # dry-run
node --import tsx scripts/heal-plan.ts --apply
```

## 4. Phase B — 翻訳ワーカー分離（任意・数日運用後でも可）

`deploy.md` の Phase B の手順どおり（`INTERNAL_API_TOKEN` 設定 → `deploy.ps1 -Phase B -InstallWorker`）。

## 5. 確認

- `ops\status.ps1` → health 200 / 新 BUILD_ID / Collabora ok
- ログイン（ja / id）、バックログ・スプリントボード・全体計画・通知ベル・Ctrl+K 検索を一通り
- Collabora の文書は開き直す（WOPI トークン形式が変わっているため）
- 管理画面の用語集に `board → ボード` を登録（機械翻訳の「基板」対策）

## 6. 利用者への周知事項

- パスワードは新規設定・変更時に 8 文字以上（既存パスワードはそのまま使える）
- ログアウトは右上のアバターメニュー内
- 新規プロジェクトは AI 監視が既定オフ（プロジェクト設定で有効化）
- 共有 Ollama（BankMasalah）の負荷: 既存コメントの一括翻訳が初回に走る。BankMasalah 担当へ事前連絡

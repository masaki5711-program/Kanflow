# CI/CD（main へのマージで本番へ自動デプロイ）

## しくみ

```
開発ブランチ ──MR──▶ main に push（マージ）
                      │
          GitLab パイプライン
          ├─ lint / typecheck / test / migrate-check（Docker Runner がある場合）
          └─ deploy-production ──▶ 本番 PC の GitLab Runner（タグ kanflow-prod）
                                     └─ ops\deploy\auto-deploy.ps1
                                          ├─ 本番ツリー D:\APP\Kanflow を対象コミットへ（タグ deploy-YYYYMMDD-HHmmss-<sha>）
                                          └─ ops\deploy\deploy.ps1 -ApplyMigrations
                                               品質ゲート → バックアップ → ビルド → マイグレーション
                                               → 切り替え → ヘルスチェック（失敗時は自動ロールバック＋アラート）
```

- 本番 PC は社内ネットワークの中にあるため、GitLab から本番へは接続できない。本番 PC に入れた Runner が GitLab にジョブを取りに行く（外向き通信のみ）。
- deploy ジョブは他の CI ジョブを待たない（`needs: []`）。代わりに本番 PC 上で同じ品質ゲート（lint・型チェック・テスト＋カバレッジ）が必ず走り、通らなければ本番は一切変わらない。
- 同時に 2 つのデプロイは走らない（`resource_group: production`、Runner の `concurrent = 1`）。
- 停止時間はビルドの切り替え時の数十秒のみ（`swap-build.ps1`）。

## 自動デプロイされないケース（本番は変更されない）

| 状況 | 結果 | 対応 |
|---|---|---|
| 品質ゲート失敗 | ジョブ失敗、本番は旧ビルドのまま | 修正して main へ再マージ |
| `app/package-lock.json` が変わった | ジョブ失敗（exit 11） | 依存更新は手動手順（`deploy.md`、サービス停止＋`npm ci`）で行う |
| 本番ツリーに手作業の変更がある | ジョブ失敗（exit 10） | `D:\APP\Kanflow` で `git status` を確認し、変更を戻す |
| ビルド・マイグレーション・ヘルスチェック失敗 | `deploy.ps1` がビルドを自動ロールバック、ソースも元のリビジョンへ | `ops\logs\deploy.log` と `deploy-build-*.log` を確認 |

ログ: GitLab のジョブログ、`D:\APP\Kanflow\ops\logs\auto-deploy.log`、`deploy.log`、`quality-gate.log`。

## 初回セットアップ（1 回だけ）

1. **GitLab で Runner を作成**
   プロジェクト → 設定 → CI/CD → Runners → 「New project runner」
   - Tags: `kanflow-prod`
   - 「Run untagged jobs」: **オフ**（Docker 前提の他のジョブを本番 PC で動かさないため）
   - 作成後に表示される `glrt-` で始まるトークンを控える
2. **本番 PC で Runner をインストール**（管理者 PowerShell）
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\runner\install-runner.ps1 -Token glrt-xxxxxxxx
   ```
   GitLab の Runners 画面で緑（online）になれば完了。トークンは `D:\APP\Kanflow-runner\config.toml` にだけ保存される。
3. **main を保護**（推奨）
   設定 → リポジトリ → Protected branches で main への push を Maintainer のみ、マージは MR 経由に。main への push がそのまま本番反映になるため。

## 日常の使い方

1. 機能ブランチで作業し、MR を作成
2. レビュー後に main へマージ → 数分後に deploy-production が開始（品質ゲート込みで 15〜25 分）
3. GitLab → Deployments → Environments の production で、いつ・どのコミットが反映されたか確認できる

## 手動での戻し方

```powershell
cd D:\APP\Kanflow
git tag --list "deploy-*" --sort=-creatordate | Select-Object -First 5   # 直近のデプロイタグ
# 前のビルドへ即時に戻す（ソースはそのまま）
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\swap-build.ps1 -Rollback
# ソースも戻す場合は、戻したいタグを detached で取り出してから deploy.ps1 を手動実行
git checkout --detach <tag>
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\deploy.ps1 -Phase A
```

マイグレーションは追加型のみで運用しているため、ビルドを戻しても DB はそのままでよい。破壊的なマイグレーションを含むリリースは自動デプロイに任せず、`deploy.md` の手順でバックアップを確認してから行う。

## Runner の停止・削除

```powershell
D:\APP\Kanflow-runner\gitlab-runner.exe stop        # 一時停止（自動デプロイを止める）
D:\APP\Kanflow-runner\gitlab-runner.exe start
D:\APP\Kanflow-runner\gitlab-runner.exe uninstall   # サービス削除（GitLab 側の Runner も削除する）
```

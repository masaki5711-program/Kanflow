# 計画を作る（実績から作るスケジュール）の運用

計画 12 §6「運用」の Kanflow 側のまとめ。見積もりの仕組みそのものは `D:\APP\git_station\Git\docs\plan\12-schedule-from-actuals.md`、
決定は `references/decisions.md` にある。

## 1. 「実績で調整」が効くまで

「計画を作る」は、テンプレート → 確定した反省点の規則 → **実績での期間の調整** → 負荷の平準化、の順に案を作る。
3 番目の実績での調整は、**系統ごとに次の 2 つがそろったときだけ**効く（`services/plan-estimate-run/gate.ts`）。

1. **過去の計画での検証（バックテスト）が条件を満たす**: その系統の終わったプロジェクトを、それより前に終わったものだけで見積もり直して
   実績と比べ、検証したプロジェクトが 5 件以上、期間の誤差がテンプレートの 85% 以下、P80 の当たりが 70〜90%、終了日の誤差がテンプレート以下。
2. **管理者が有効にした**: 管理 → 「見積もりの検証」（`/admin/plan-estimate-eval`）で、条件を満たした系統の「有効にする」を押す
   （計画 12 §8 の 6: 本物のデータで既定を有効にするのは、人が成績を見てから）。有効にしたのは見積もりの方式の版ごとで、方式が変わると
   もう一度有効にする必要がある。

どちらかが欠けると、案はテンプレートの期間のままで、カードに理由が出る（反省点の規則と負荷の平準化は効く）。

### 検証はいつ計算されるか

- **実績を確定したとき** と **学習に含める / 含めないを切り替えたとき**、その系統について自動で（`services/plan-estimate-eval/eval.service.ts`
  `afterActualsChange`）。確定の処理そのものは先に終わっていて、検証の失敗で確定が失敗することはない（ログに
  `backtest after an actuals change failed` が出て、前の記録のまま）。
- **管理者が「計算し直す」を押したとき**、確定した実績のあるすべての系統について（500 系統まで。超えると断る）。
- 成績が下がったら（条件を満たしていたのが満たさなくなった、または誤差の比が 0.1 以上悪くなった）、確定したプロジェクトの PO / SM に
  通知が届く（`plan_estimate_worse`。**数字は入れない** — 数字は管理者だけが見る）。

### 検証に入るプロジェクト

- 系統の、今のスナップショット（作り直されていない、学習に含める）があるプロジェクト。
- **全体計画をスケジュールの読み込みで作ったもの**だけ（読み込んだ内容が、テンプレートの日数で見積もり直す元になる）。手で作った全体計画は
  数に入らない（管理画面の件数がプロジェクトの数より少ないのはこのため）。
- 機密の PBI は、使う時点で除く（`learnableItemFacts` を通る。ほかの道は無い）。
- 時間の向き: プロジェクトごとに、その開始月の 1 日より前に**終わって、かつ確定された**ものだけから学ぶ。昔のプロジェクトを今まとめて
  確定すると、確定の日付が新しいので互いから学べず、成績はテンプレートと同じになる。これは未来の情報を使わないための仕様。

## 2. 見積もりが変なときの調べ方

1. **案の ID（`runId`）を確かめる**: 画面の案のカード、またはログの `estimate run created`（`projectId`・`runId`・`inputHash`・
   `methodVersion`・`gateOn`）。承認で断られたときは `estimate run refused on approval`（`reason` が `plan_changed` / `expired` /
   `approver_limited` など）。
2. **根拠を見る**: 画面の「根拠」（`GET /api/projects/{projectId}/plan/estimate-runs/{runId}/evidence`）。葉ごとに、テンプレートの日数、
   反省点の規則（どの規則が足したか・伸縮の倍率）、実績での見積もり（段・件数の帯・P50 / P80）。
3. **出典を見る**: 根拠に出る出典のプロジェクト（見る人が見られるものだけ。見られないものは件数の帯だけ）。出典のプロジェクトで、
   確定した実績（全体計画 → 実績）の該当する葉の予定と実績の日数を確かめる。
4. **リポジトリの内訳**: 出典の葉に結んだ PBI の MR の数・リードタイム（実績の画面の葉の詳細）。読めなかったリポジトリは 0 ではなく
   「不明」。
5. **検証の記録を見る**: 管理 → 「見積もりの検証」で、その系統の成績・計算した日・有効かどうか。`gateOn` が false なら、カードの理由と
   ここの「条件を満たさない」の項目が一致するはず。

よくある原因:

| 症状 | 見るところ |
|---|---|
| 「実績での見直しがまだ使えません（管理者がまだ有効にしていません）」 | 管理画面で条件を満たしていれば「有効にする」 |
| 系統の件数が思ったより少ない | 手で作った全体計画、学習に含めないにした実績、作り直されたスナップショットは入らない |
| 特定の葉だけ大きく伸びた | 根拠でその葉の段と件数。出典の実績に入力の誤り（日付の打ち間違い）がないか。外れ値（3 MAD）は除かれるが、件数が少ないと効かない |
| 承認で「作り直してください」（`PLAN_ESTIMATE_STALE`） | 案を作った後に、実績の確定・規則の確定・稼働量・テンプレートのどれかが変わった。案を作り直す |
| AI の補助が効かない | ログの `plan llm call failed; deterministic path`（`reason`: `unavailable` / `timeout` / `invalid`）。Ollama が止まっていても決定的な部分は動く |

## 3. ログ（JSON 1 行。本番は `D:\APP\KanflowV2\ops\web-v2\daemon\kanflowv2.out.log`）

| `module` | `msg` | 意味 |
|---|---|---|
| `plan-estimate-run` | `estimate run created` | 案を作った（`runId`・`inputHash`・`methodVersion`・`gateOn`） |
| `plan-estimate-run` | `estimate run loaded` | 案を全体計画に入れた |
| `plan-estimate-run` | `estimate run refused on approval` | 承認の時に古くなっていた（`reason`） |
| `plan-estimate-eval` | `backtest recorded` | 系統の検証を記録した（`lineage`・`n`・`skipped`・`passes`・`reason`） |
| `plan-estimate-eval` | `backtest after an actuals change failed; …` | 確定の後の検証に失敗（確定は成功している）。「計算し直す」でやり直せる |
| `plan-estimate-eval` | `estimate from actuals approved / withdrawn for a lineage` | 管理者が有効 / 無効にした（`lineage`・`actorId`） |
| `plan-llm` | `plan llm call failed; deterministic path` | LLM の時間切れ・停止。決定的な部分に戻った |

計画 12 §6 の「メトリクス」（実行の時間、LLM の時間切れの数、`PLAN_ESTIMATE_STALE` の回数、確定の時に読めなかったリポジトリの数）は、
今は上のログから数える。管理 → 「メトリクス」の画面にはまだ出していない。

## 4. 表

| 表 | 中身 | 保持 |
|---|---|---|
| `plan_estimate_run` | 案（入力のハッシュ・根拠・カード） | 作ってから 1 年（毎日の処理で消す） |
| `plan_estimate_eval` | 系統ごとの検証の記録（計算のたびに 1 行。ゲートは最新の行を読む） | 消さない（小さい） |
| `plan_estimate_gate_approval` | 系統ごとの管理者の有効化（方式の版つき） | 無効にすると消える |
| `plan_estimate_hidden_state` | 見えない出典の保持状態 | **消さない**（数字から見えない出典が漏れるのを防ぐ。`references/decisions.md`） |

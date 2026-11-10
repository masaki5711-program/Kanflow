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
3. **その記録が今の実績から計算されている**: 記録の後に実績の確定・学習の切り替えがあると、再計算が終わるまで「再計算待ち」になり、
   テンプレートの期間を使う（計算が遅れても失敗しても、古い「有効」のまま案を作らない）。

どれかが欠けると、案はテンプレートの期間のままで、カードに理由が出る（反省点の規則と負荷の平準化は効く）。

**有効のあと**: 後の検証が条件を満たさなくなると、その時点で**自動で無効になる**（もう一度条件を満たしても、管理者がもう一度見て
有効にするまで戻らない）。有効・無効の履歴は消さずに残る（`plan_estimate_gate_approval`: 誰が有効にしたか、無効にしたか、なぜ終わったか）。

### 見積もりのパラメータ（探索と承認）

外れ値の基準（MAD）・半減期・縮め K・P80 の既定の広がり S0 は、**系統ごとに管理者が承認した値**を使える（承認が無ければ既定の
3 MAD・365 日・K 3・0.25）。値は人が決める。仕組みは提案するだけで、LLM は使わない
（`services/plan-estimate-eval/param-search.ts`・`params.service.ts`）。

- **探す**: 管理画面の「パラメータを探す」で、確定した実績のあるすべての系統について、既定を挟む 81 通りの組み合わせを過去の検証と
  同じ計算で試す。応答は待たず、検証と同じ順番の道で 1 系統ずつ（候補ごとに他の要求に譲る）。毎朝の処理でも、検証の記録が古かった
  系統について探す。1 系統 60 秒を超えると提案しない（「時間内に試し終わらなかった」）。
- **提案の条件**: 終わったプロジェクトが 5 件以上。新しい方の 3 分の 1 は確かめ用で、選ぶのに使わない。残りで既定より期間の誤差が
  5% 以上小さい（または P80 の当たりを 70〜90% に入れて誤差が悪くならない）、確かめ用で既定より悪くない、全体で「有効にできる条件」を
  満たす。満たさなければ「提案はありません」と理由が出る。同じ実績なら何度探しても同じ提案になる。
- **承認 / 却下**: 画面の表（既定と提案の値、全体と確かめ用の成績）を見て「提案を承認する」か「却下する」。承認できるのは最新の、今の
  実績からの提案だけ（実績が変わると「探し直すまで承認できません」）。承認すると、その値での検証がその系統の最新の記録になる。
  「実績で調整」の有効化（上の 2）は別の判断で、承認した値は有効なときだけ使われる。
- **既定に戻る**: 「既定の値に戻す」（管理者）、または**後の検証が承認した値で条件を満たさなくなったとき自動で**（ログ
  `approved estimator settings ended for a lineage; it uses the defaults`、`endReason` = `failed`）。方式の版が変わったときも戻る（`method`）。
  手で戻したあとは既定の値での検証が計算し直されるまで（数秒〜数十秒）「再計算待ち」になる。
- 承認した値が変わると、それより前に作った案は承認の時に「作り直してください」になる（入力のハッシュに値が入る）。

### 検証はいつ計算されるか

- **実績を確定したとき** と **学習に含める / 含めないを切り替えたとき**、その系統について自動で（再確定で系統が変わったときは前の系統も）。
  確定の応答は待たず、Web の中で順番に（1 度に 1 系統、同じ系統の続けての変更はまとめて 1 回）計算する
  （`services/plan-estimate-eval/eval.service.ts` `enqueueAfterActualsChange`）。失敗はログ
  `backtest after an actuals change failed; …` に出て、その系統は「再計算待ち」のまま（＝テンプレートの期間）。「計算し直す」でやり直せる。
- **毎朝の処理（07:45、毎日の処理の 7 番目）**、記録が無い系統と、記録が今の実績からでない系統だけ（再起動で消えた待ち、失敗した計算、
  プロジェクトの完全な削除、この機能より前に確定した実績）。ログは `backtest catch-up done` / `… finished with failures`。
- **管理者が「計算し直す」を押したとき**、確定した実績のあるすべての系統について（500 系統まで。超えると断る）。1 系統の失敗で
  止まらず、失敗した数を画面に出す。
- 系統ごとの書き込みは順番に行い（同時に計算しても、古いデータの結果が新しい記録として残らない）、計算の途中で実績が変わった結果は捨てる。
- **有効だった系統が自動で無効になったら**、その変更をしたプロジェクトの PO / SM に通知が届く（`plan_estimate_worse`）。
  **数字も理由も入れない**（数字は管理者だけが見る。理由は案のカードに出る）。テンプレートの名前は公開のテンプレートのときだけ入る。

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
| 「…（実績が確定された後の検証の計算がまだ終わっていません）」 | 数秒〜数十秒で終わる。続くときはログの `backtest after an actuals change failed` を見て、管理画面の「計算し直す」 |
| 有効にしたのに無効に戻った | 管理画面のその系統に「自動で無効になりました」。後の検証が条件を満たさなくなった。成績を見て、もう一度有効にするか決める |
| 「対象外 n 件」が多い | ログの `backtest left projects or leaves out` に理由（`no_loaded_schedule` / `schedule_unreadable` / `schedule_invalid` / `no_scored_leaf`）とプロジェクトが出る |
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
| `plan-estimate-eval` | `backtest left projects or leaves out` | 検証に入らなかったプロジェクト・葉と理由（warn） |
| `plan-estimate-eval` | `backtest result discarded: …` | 計算の途中で実績が変わったので捨てた（次の計算が記録する） |
| `plan-estimate-eval` | `backtest after an actuals change failed; …` | 確定の後の検証に失敗（確定は成功している）。系統は「再計算待ち」。「計算し直す」でやり直せる |
| `plan-estimate-eval` | `estimate from actuals turned off for a lineage` | 有効だった系統が自動で無効になった（`endReason`: `failed` / `method`） |
| `plan-estimate-eval` | `estimate from actuals approved / withdrawn for a lineage` | 管理者が有効 / 無効にした（`lineage`・`actorId`） |
| `plan-estimate-eval` | `parameter search recorded` | 系統のパラメータを探した（`outcome`: `propose` / `keep_default`、`reason`、`evaluated` / `candidates`。時間切れは warn） |
| `plan-estimate-eval` | `parameter search of a lineage failed; the others go on` | 1 系統の探索に失敗（ほかは続く）。「パラメータを探す」でやり直せる |
| `plan-estimate-eval` | `parameter search discarded: …` | 探している間に実績が変わったので捨てた |
| `plan-estimate-eval` | `estimator settings approved / … rejected / … returned to the defaults for a lineage` | 管理者がパラメータを承認 / 却下 / 既定に戻した |
| `plan-estimate-eval` | `approved estimator settings ended for a lineage; it uses the defaults` | 承認した値での検証が条件を満たさない（`failed`）か方式が変わった（`method`）ので既定に戻った（warn） |
| `collab-daily` | `parameter search done` / `… finished with failures` / `parameter search failed` | 毎朝の処理の探索（古かった系統だけ） |
| `plan-llm` | `plan llm call failed; deterministic path` | LLM の時間切れ・停止。決定的な部分に戻った |

計画 12 §6 の「メトリクス」（実行の時間、LLM の時間切れの数、`PLAN_ESTIMATE_STALE` の回数、確定の時に読めなかったリポジトリの数）は、
今は上のログから数える。管理 → 「メトリクス」の画面にはまだ出していない。

## 4. 表

| 表 | 中身 | 保持 |
|---|---|---|
| `plan_estimate_run` | 案（入力のハッシュ・根拠・カード） | 作ってから 1 年（毎日の処理で消す） |
| `plan_estimate_eval` | 系統ごとの検証の記録（計算のたびに 1 行。ゲートは最新の行を読む。`inputHash` で今の実績からの計算か、`paramApprovalId` で今の値での計算かを見る） | 消さない（1 行 100 バイトほど） |
| `plan_estimate_gate_approval` | 系統ごとの管理者の有効化と、その終わり（無効にした・自動で無効・方式の変更） | 消さない（履歴） |
| `plan_estimate_param_proposal` | 系統ごとのパラメータの探索の結果（提案または既定のままと理由、既定と提案の成績は系統の集計だけ、承認 / 却下 / 置き換え） | 消さない（履歴） |
| `plan_estimate_param_approval` | 系統ごとの承認した値と、その終わり（既定に戻した・自動で戻った・方式の変更・新しい承認） | 消さない（履歴） |
| `plan_estimate_hidden_state` | 見えない出典の保持状態 | **消さない**（数字から見えない出典が漏れるのを防ぐ。`references/decisions.md`） |

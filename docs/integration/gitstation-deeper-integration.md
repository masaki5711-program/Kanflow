# GitStation との連携を深める案（Kanflow から、2026-11-10）

状態: **案**。決まったことではない。計画の正は `D:\APP\git_station\Git\docs\plan\`（02・11・12）で、
ここで採ると決めたものは、そちらの計画と `references/decisions.md` に移す。

**続き**: Kanflow から GitStation を操作する計画（3 つの入り口、操作の一覧、GitStation への依頼）は
`gitstation-operations-plan.md` に書いた。A5 はその章 3、A6 は章 4 に入れた。この文書と食い違うときは、新しいほうを正とする。

印: **［確認済］** = GitStation のコード（`crates/forge-web/src/routes/`）か `docs/api/` で確かめた。
**［未確認］** = まだ確かめていない前提。着手の前に確かめる。

## 1. いまの連携（2026-11-10、本番 `v2-prod-20261110`）

| 向き | 内容 |
|---|---|
| GitStation → Kanflow | 連携のイベントの履歴を **定期に読む**（`merge_request.` で始まる種類はどれも「MR を読み直す」合図として扱う。`repository.pushed`）。MR の一覧・1 件、ブランチとコミット、開発の状態。`deployment.*` は GitStation のイベントにまだ無く、Kanflow も扱っていない（2026-11-10 訂正） |
| Kanflow → GitStation | 利用者の代理（act-as）での承認、「私の承認を待つ MR」、リポジトリとプロジェクトの結びつけ |
| 計画への利用 | MR の `openedAt` → `mergedAt` の所要、触ったリポジトリの数を、実績からの日程（E0〜E6）に使う |

Kanflow がまだ使っていない GitStation の面 ［確認済］:

- **Webhook**（`docs/api/webhooks.md`）。「読みに来て」の合図で、正はイベントの履歴
- **Checks API**（`docs/api/checks.md`）。`kanflow/` の名前空間は Kanflow のサービスアカウントが書ける。保護ブランチの **必須のチェック** にできる
- イベント `check.completed`、`merge_request.commented` / `pushed` / `unapproved` / `draft_changed` / `conflict_detected`（どれも `occurred_at` を持つ）
- `specs/requirements`・`specs/trace`・`specs/diff`、`context/work-item`・`context/requirement`、`merge-requests/{iid}/context`
- 文書の API（`/documents`）、`gstn mcp`（読み取りだけの MCP、9 個のツール。stdio のプロセスで、HTTP の口ではない）

## 2. 案

### A. GitStation を変えずにできる

**A1. Kanflow が「マージしてよいか」をチェックとして報告する** ［確認済: Checks API］

Kanflow が MR の head のコミットに `kanflow/acceptance` を報告する。条件の例: PBI がそのスプリントにある、
受け入れ条件がすべて決まっている、ほかの人の作業の宣言（claim）と重なっていない。GitStation の側でこれを
必須のチェックにすれば、**条件を満たさない MR はマージできない**。いまは Kanflow が GitStation を「見る」だけで、
GitStation のマージの判断に Kanflow の状態が入っていない。これが最も効く。

- 前提: 管理者が `kanflow/` の名前空間をプロジェクトごとにサービスアカウントへ割り当てる
- 注意: push のたびに head が変わるので、`merge_request.pushed` を読んで報告し直す。報告が無いことは成功にならない
  （`required_check_missing`）ので、Kanflow が止まるとマージも止まる。**必須にするかはプロジェクトごとに選ぶ**

**A2. 受け入れ条件の証拠を GitStation から埋める** ［確認済: `specs/trace`、`evidenceKind`］

受け入れ条件は `evidenceKind`（test / inspection / measurement / approval）を持つ。

| 種類 | GitStation から取るもの |
|---|---|
| test | `specs/trace` の `@req PBI-n/AC-m` に結ばれたテストと、その head の `check.completed` |
| approval | MR の承認（`merge_request.approved`、承認した人と時刻） |
| inspection / measurement | 文書の API の文書（計画 13）への参照 ［未確認: 文書から PBI への参照の形］ |

PBI の画面に「条件ごとに、証拠があるか」を出し、スプリントレビューの確認を速くする。完了の判定そのものは人が行う
（F-6 の集計の最初の形）。機密の PBI は従来どおり MCP と LLM に出さない。

**A3. Webhook を合図として受ける** ［確認済: 契約。Kanflow に受信の経路は無い］

いまは定期の読み取りなので、MR の変化が Kanflow に出るまで間がある。Webhook を受けたら、すぐにイベントの履歴を
読む（Webhook の本文は使わず、合図としてだけ扱う。署名を確かめ、失敗しても定期の読み取りが拾う）。

- **前提（いまは満たしていない）**: GitStation は送り先に `https` だけを許し、ループバック（`127.0.0.1`）は許可リストに
  関係なく拒む。Kanflow の本番は `http` の :3000 なので、**Kanflow を https にするまで使えない**
- 得られるのは、最大 3 分（`GIT_SYNC_INTERVAL_SEC` の既定 180 秒）の遅れが数秒になること。https のあとに行う

**A4. 所要を「書く時間」と「レビューを待つ時間」に分ける** ［確認済: イベントと `occurred_at`］

`opened` → 最初の `commented` / `approved`（最初の反応までの待ち）、`pushed` の回数（やり直しの回数）、
最後の `approved` → `merged`（マージの待ち）。実績からの日程が、いまは 1 本の所要として持っている数を分けて持てる。
「レビューが詰まっているので遅れる」を日程の根拠として示せる。

- ［確認済］ `merge_request.commented` と `pushed` は連携のイベントの種類に有る。連携の `event_types` に入っていれば履歴に出る

**A5. Claude Code に 1 回で渡す文脈** ［確認済: `context/work-item`、`merge-requests/{iid}/context`］

Kanflow の MCP に、PBI・受け入れ条件・作業の宣言と、GitStation の MR の状態・最初に止めている理由・
要求とテストの対応の欠けを **まとめて返す** ツールを足す。いまは Claude Code が Kanflow の MCP と `gstn mcp` を
別々に呼んで自分でつなぐ。機密の規則は両方を掛ける（Kanflow の機密の PBI、GitStation の FG-AUTH-0022）。

**A6. 実際に変えたファイルと、作業の宣言の範囲を突き合わせる** ［確認済: `declare_scope`。MR が変えたパスは `merge-requests/{iid}/context` の `files[]` で取れる］

MR が変えたパスが、ほかの人の宣言した範囲（`declare_scope`）に入るとき、マージの前に両者へ知らせる。
`merge_request.conflict_predicted` も読めば、GitStation の予測と Kanflow の宣言の 2 つから出せる。

### B. GitStation の側の実装を待つ

| 案 | 待っているもの |
|---|---|
| B1. 差分の大きさ（行数・版の数）を見積もりに使う | **G1**（`version_count`・`diff_stats`）。両方のリポジトリに無い。Kanflow の `GitLink` は欄を持つが、GitStation から書く処理が無い |
| B2. CI の失敗 → 教訓の記録・課題の起票（F-12） | M4（`pipeline.*`） |
| B3. リリースとデプロイの対応（F-10）、Kanflow からのデプロイ（W13） | M4 / M5（`deployment.*`） |
| B4. LLM による門番（W14） | M4 のあと |
| B5. テンプレートのリポジトリのタグ → 全体計画の更新の提案 | タグのイベント ［未確認: いまのイベントの種類に見当たらない］ |

### C. エージェント（Claude Code）をまたぐ

- **C1.** Kanflow の作業の宣言の `sessionId` を、MR の説明かトレーラーに書く。どのセッションがどの MR を作ったかを
  両方からたどれる
- **C2.** 全体計画の行を MCP から直接に変えるツール（日付・進み具合・担当・依存）。いまは「提案 → 人が承認」だけで、
  既にある行は MCP から変えられない。足すなら、トークンの範囲 `plan:write` と役割 `plan.write` の両方を要し、
  履歴に `via: mcp` を残す。**`docs/mcp.md` の「計画には書かない」という決まりを変えることになる**

## 3. 順番の案

1. A1（`kanflow/acceptance`）— 試しに 1 つのプロジェクトで、必須にせずに報告だけ（実装済み: `ba3b320`、ブランチ `feat/L4-NOPBI-gitstation-acceptance-check`。v2 の線に取り込み済み（`882ff48`）。条件から「作業の宣言の重なり」は外した）
2. A3（Webhook の合図）— Kanflow の https のあと
3. A2 の test と approval — `specs/trace` を読むところから
4. A4
5. A5・A6・C1

B は GitStation の計画（M4、G1）に合わせる。C2 は実装済み（`f982659`、ブランチ `feat/L4-NOPBI-mcp-plan-write`。v2 の線に取り込み済み（`882ff48`））。

## 4. 決めること

- A1 を必須のチェックにしてよいプロジェクトはあるか（Kanflow が止まるとマージが止まる）
- C2: 既にある計画の行を、承認なしに MCP から変えてよいか
- G1 を GitStation の計画のどこに入れるか

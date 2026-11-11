# Kanflow から GitStation を操作する計画（2026-11-10）

状態: **利用者が承認した（2026-11-10、「推奨で進めて欲しい」）。** 章 12 の 10 件は、どれも推奨のとおりに決まった。
同じ日に利用者から 2 つの要望が加わった（マージの履歴 = N11、GitStation のリポジトリを AI の参照資料に = N12。章 8）。
**まだ決まっていないものが 1 つ有る**: ローカル LLM に機密の PBI を渡してよいか（章 9 の 9、N1）。
GitStation 側のセッションの指示（`kanflow-session-brief.md`、2026-11-10）への答えで、章 1〜8 は指示の §3 の 1〜8 に対応する。

調べた版（読み取りだけ）:

- GitStation: main `768e5da`（`D:\APP\git_station\Git`）で書き、同じ日に `059cc34`（M4 C2: push からのパイプライン）で確かめ直した。
  変わったのは章 1.4 の 18・19（パイプラインの API が入った）。API は `docs/api/openapi.json` とルートの定義（`crates/forge-web/src/app.rs`）、
  代理の許可は `crates/forge-auth/src/action.rs`、イベントは `crates/forge-core/src/event_type.rs`、CLI と MCP は `crates/forge-client`
- Kanflow: v2 の線 `ed7a74a`（`D:\APP\Kanflow-v2`）で書いた。そのあと、A1 = `ba3b320`（検査 `kanflow/acceptance` の報告）と
  C2 = `f982659`（MCP から全体計画に書く道具）を v2 の線に取り込んだ（`25f0783`、`882ff48`。push と本番への反映はしていない）

印: **［未確認］** = コードで確かめきれなかった前提。着手の前に確かめる。印の無い事実は、コードか `openapi.json` で確かめた。

言葉:

| 言葉 | 意味 |
|---|---|
| 同期 | Kanflow が、連携のサービスアカウントのトークンで GitStation を読み、Kanflow の DB に持つこと |
| 写し | 同期で Kanflow が持っている GitStation のデータ（MR の状態など）。Kanflow の権限で見せる |
| 代理（act-as） | Kanflow が、サービスアカウントのトークンに `Forge-Act-As: employee:<社員番号>` を付けて、その人として呼ぶこと。権限は、サービスアカウントとその人の小さいほう |
| 本人 | Claude Code のセッションが、その人の GitStation のトークンで、GitStation を直接に呼ぶこと |

## 0. 結論

1. **MCP の構成は A を推す**（セッションは Kanflow と GitStation をそれぞれ本人のトークンで呼ぶ）。Kanflow の MCP は GitStation に書かない。
   ただし、Kanflow の MCP は **写し** を答えに入れる（PBI に結ばれた MR、止まっている理由、衝突の予測、検査の結論）。
   これは代理ではなく、画面に出しているものを MCP にも出すだけである。
2. **A は今日から動くが、GitStation の MCP では動かない。** GitStation の MCP は読み取り 9 個（文脈・要件・文書）だけで、
   MR の状態・衝突・検査・MR の作成の道具が無い。セッションは CLI の `gstn`（`mr create`、`conflicts`、`checks`、`api`）を使う。
   道具の追加は GitStation への依頼にする（章 7 の R1）。
3. **読み取りの多くは、GitStation を変えずに今できる。** 止まっている理由（`/status`）、衝突の予測（`/conflicts`）、
   MR が変えたパス（`/context`）は、いまの許可で読める。Kanflow の同期がまだ使っていないだけである。
4. **書き込みは、Kanflow の画面とチャットからは今はできない**（承認を除く）。MR の作成は代理の許可の外で、ブランチの作成は API が無い。
   画面から作りたいなら ADR-0025 の改訂が要る。セッション（A）が有るなら急がない。
5. **着手の 1 操作** は、Kanflow の MCP に `start_work` を 1 つ足し、ブランチと下書きの MR はセッションが `git` と `gstn` で作る。
   利用者から見た「1 操作」は、エージェントモデルのスキル（`/kanflow start PBI-12`）がまとめる。
6. **決めることが 1 つ残っている。** Kanflow のチャット（ローカル LLM）の道具には機密の PBI（D-5）のフィルターが無い。
   これは「穴」とは言い切れない。D-5 の元の文（GitStation の計画 06）は、機密の高い仕様を **ローカル LLM にだけ** 渡してよいとしており、
   Kanflow のスキーマの注釈も同じである。`CLAUDE.md` §4 と指示の §4 は「LLM にも返さない」と書いている（章 9 の 9）。
   どちらを正とするかを利用者が決めるまで、チャットの動きは変えない。
7. パイプラインは、一覧・1 件・手での実行・取り消し・やり直しの API が `059cc34` で入った（ログとイベントはまだ無い）。
   デプロイ・マージキュー・自動マージ・レビューの依頼は、API もイベントもまだ無い。
   章 5 に、Kanflow が表示に要る項目を、イベントを決める材料として書いた。
8. **GitStation の状況（マージの履歴など）は、Kanflow の画面に出せる**（N11）。**GitStation のリポジトリは、AI の参照資料にできる**（N12）。
   どちらも GitStation の変更は要らない（章 8）。

## 1. 操作の一覧表

「権限」の列: **同期** = サービスアカウント、**代理** = act-as、**本人** = セッションが本人のトークンで直接。
「広げる」の列: Kanflow の代理の許可（`action.rs` の許可の一覧）を広げる必要が有るか。

### 1.1 読み取り — API が有り、いまの許可でできる

| 順 | 操作 | GitStation の API | 画面 | チャット | MCP | 人の確認 | 広げる |
|---|---|---|---|---|---|---|---|
| 1 | 止まっている理由 | `GET …/merge-requests/{iid}/status` | 写し＋開いた時に代理（`viewer.*` は人ごと） | 写し | 写し。最新は本人 | 不要 | 不要 |
| 2 | 衝突の予測 | `GET …/merge-requests/{iid}/conflicts` | 写し | 写し | 写し。最新は本人（`gstn conflicts`） | 不要 | 不要 |
| 3 | MR の一覧・1 件・PBI ごとの開発の状況 | `GET …/merge-requests`、`…/{iid}`、`…/work-items/{ref}/dev-status` | 写し（既に有る） | 写し | 写し（`get_pbi` に足す）。最新は本人 | 不要 | 不要 |
| 4 | 検査の結果（名前と結論） | `/status` と dev-status の `checks[]` | 写し | 写し | 写し。最新は本人 | 不要 | 不要 |
| 5 | MR が変えたパス | `GET …/merge-requests/{iid}/context` の `files[]` | 写し（範囲の外の警告） | — | 写し（重なりの答え） | 不要 | 不要 |
| 6 | コメントを読む | `GET …/discussions` | GitStation へのリンクで足りる | — | 本人 | 不要 | 不要 |
| 7 | 検査の本文（`summary`、`annotations`、`details_url`） | `GET …/commits/{sha}/checks` | 代理は **拒まれる**（`CheckRead`）。同期では読める | LLM に渡さない（章 10） | 本人（`gstn checks`） | 不要 | 画面に人ごとの権限で出すなら **要る**（R3） |

- 1〜5 は、同期のサービスアカウントで読める（結び付けで Reporter になる）。Kanflow は MR の一覧と 1 件しか読んでおらず、
  `/status` は承認のボタンのために代理で読むだけ、`/conflicts` と `/context` は読んでいない。
- 写しを見られるのは Kanflow のプロジェクトのメンバーである。GitStation のプロジェクトのメンバーとは限らない。
  これは今の「開発」パネルと同じ扱いで、新しく広げるものではない。

### 1.2 書き込み — API は有るが、Kanflow の代理では許されていない

| 順 | 操作 | GitStation の API | 画面・チャット | MCP | 人の確認 | 広げる |
|---|---|---|---|---|---|---|
| 8 | 下書きの MR を作る | `POST …/merge-requests`（Developer、スコープ `api`。作者 = 呼んだ者。両方のブランチが既に有ること） | 代理は **拒まれる** | 本人（`gstn mr create --draft`）。**今できる** | セッション: 本人の指示の内（下書きに限る）。画面・チャット: ボタンか提案カード＋ GitStation の確認ページ | 画面・チャットから作るなら **要る**（R4） |
| 9 | ブランチを作る | **API が無い**（`git push` だけ） | できない | セッションが手元で `git switch -c`、`git push -u` | 不要 | API が要る（R2） |
| 10 | MR を直す（題名・説明・対象・下書きの解除） | `PATCH …/merge-requests/{iid}`（`gstn mr edit`） | 代理は拒まれる | 本人。AI のトークンでも、自分が作者の MR なら下書きを解除できる（`MergeRequestUpdate` は「人だけ」の操作に入っていない） | 下書きの解除は人が行うのを推す。GitStation は拒まないので、スキルの決まりで守る | 急がない |
| 11 | コメントを書く | `POST …/discussions`、`…/notes`（Reporter、スコープ `api`。AI のトークンでも書ける。議論の「解決」は人だけ） | 代理は拒まれる | 本人 | 不要 | 急がない |
| 12 | MR に PBI を結ぶ | `…/merge-requests/{iid}/work-items` | 代理は拒まれる | 本人。ふつうは PBI のキーを書けば GitStation が結ぶ ［未確認: 拾う場所（ブランチ名・題名・説明）］ | 不要 | 不要 |
| 13 | 閉じる・開き直す | `POST …/close`、`…/reopen` | GitStation へのリンク | 本人 | 不要 | 広げない |

### 1.3 既に有る・線を変えない

| 順 | 操作 | 入り口 | 権限 | 人の確認 |
|---|---|---|---|---|
| 14 | 承認・承認の取り消し | **画面だけ**（K4、本番に有る） | 代理＋ GitStation の確認ページで得た短い証明（5 分以内） | **必ず要る**（本人が確認ページを押す） |
| 15 | 私の承認を待つ MR | 画面（プロジェクトのダッシュボード）。チャットと MCP には一覧とリンクまで | 代理 | 不要 |
| 16 | マージ | **どの入り口からも実行しない** | GitStation の画面の人だけ | — |
| 17 | 検査 `kanflow/acceptance` の報告 | 自動（A1、`ba3b320`、v2 の線に取り込み済み、既定で切） | サービスアカウント（名前空間 `kanflow` の割り当てと Developer が要る） | 不要 |

MCP とチャットには、承認もマージも出さない。チャットは「承認を待つ MR」を答え、画面へのリンクを返すところまでにする。

### 1.4 M4 の操作（パイプラインは `059cc34` で入った。ほかは API がまだ無い）

| 順 | 操作 | いま | Kanflow での扱い |
|---|---|---|---|
| 18 | パイプラインの一覧・1 件（ジョブ付き） | **有る**（`059cc34`）: `GET …/pipelines?ref=&before=&limit=`（新しい順、既定 20、最大 100、`next_before`）、`GET …/pipelines/{pipeline_id}`。読み取りは Reporter・スコープ `read_api` で、AI のトークンも読める。**ログと成果物は無い**（C5 まで）。**代理（act-as）は拒まれる**（ADR-0025 §4）。`pipeline.*` のイベントは無い | 同期のトークンで読める（写し）。セッションは本人（`gstn pipeline list` / `show`）。その人の権限で画面に出す読み取りは、代理の許可が要る（R3 と同じ扱い）。きっかけのイベントが無いので、当面は MR の head の検査（`check.completed`）で CI の赤を出す ［未確認: パイプラインの結果が検査として届くか］ |
| 19 | パイプラインの実行・取り消し・やり直し | **有る**（`059cc34`）: `POST …/pipelines`（`{"ref": "main"}`）、`…/{pipeline_id}/cancel`、`…/retry`。Developer・スコープ `api`。AI のトークンとサービスアカウントも、メンバーなら呼べる。代理は拒まれる | セッションは本人（`gstn pipeline run` / `cancel` / `retry`）。**Kanflow の画面・チャット・MCP からは出さない**（代理が拒まれる。Kanflow のサービスアカウントで呼ぶと「だれが実行したか」が消えるので、使わない） |
| 20 | デプロイの状態 | 無い（ADR-0031 は未作成） | 読み取りだけ。**本番のデプロイの実行は、道具から行えないまま** |
| 21 | マージキュー・自動マージ | 無い（ADR-0030 は未作成） | 状態の表示だけ。キューに入れる操作は、マージと同じ線で考える |
| 22 | レビューの依頼 | 無い（レビュー担当の考えが GitStation に無い） | 「私のレビューを待つ MR」を、いまの「承認できる MR」から置き換える |

## 2. MCP の入り口の構成

| 比べる点 | A: セッションが両方を本人のトークンで呼ぶ | B: Kanflow の MCP が GitStation も代理する |
|---|---|---|
| 権限を決める所 | GitStation が自分で決める。トークンは `is_agent` で、承認とマージは GitStation が拒む | Kanflow が代理する。GitStation からは「人の代理」に見え、AI か人かの区別が消える。Kanflow の側で守り直す |
| Kanflow の代理の許可 | 増えない | MR の作成などを足す。ADR-0025 の改訂が要る |
| 人の確認 | 要らない操作だけを AI のトークンに許す、という GitStation の線のまま | 代理は「本人が確認ページを押す」設計。セッションには押す画面が無いので、確認なしの代理の書き込みを新しく作ることになる |
| トークンが漏れたとき | Kanflow のトークンでは Kanflow まで、GitStation のトークンでは GitStation まで | Kanflow のトークン（`kfl_…`）1 つで GitStation の操作まで届く |
| 記録 | GitStation の記録に、本人の AI のトークンとして残る | GitStation の記録は「Kanflow が代理」。だれのセッションかは Kanflow の記録と突き合わせる |
| 止まったとき | Kanflow が止まっても `git` と `gstn` は動く | Kanflow が止まると GitStation の操作も止まる |
| 手間 | 接続 2 つ、トークン 2 つ。各自の PC に `gstn` が要る | 接続 1 つ、トークン 1 つ |
| 今日できること | `gstn` の CLI で、MR の作成・状態・衝突・検査まで全部。GitStation の MCP では文脈の読み取りだけ | 何もできない（許可も道具も無い） |
| 追従 | GitStation の API が変わっても Kanflow は変えない | Kanflow が道具を作り直し続ける |

**推奨: A。** 理由は、権限の線を 1 か所（GitStation）で守れること、Kanflow の持つ代理の権限が広がらないこと、今日から動くことである。
指示の §4 の「線引きを変えない」にも A が合う。

A に足すもの:

- **Kanflow の MCP は写しを返す。** `get_pbi` と新しい `start_work` の答えに、PBI に結ばれた MR と、その状態・止まっている理由・
  衝突の予測・検査の結論を入れる。セッションは PBI の側から 1 回で現状を知る。写しは最大で同期の間隔（既定 180 秒）だけ古いので、
  答えに「いつ読んだか」を付ける。最新が要るときは、セッションが GitStation に聞く。
- **書く先を分ける。** Kanflow への書き込み（作業の宣言、進捗、タスク）は Kanflow の MCP。GitStation への書き込み（ブランチ、MR、コメント）は
  本人のトークンで GitStation へ。Kanflow の MCP は GitStation を呼ばない。
- **GitStation に道具を頼む**（R1）。それまでは `gstn` の CLI を使う。手順はエージェントモデルのスキルに書く。

A で守ること:

- セッションに入れる GitStation のトークンは、**`is_agent` を付けて発行したもの** に限る。`is_agent` の無い個人のトークンは、
  `merge_approve`・`merge_execute` のスコープが有れば承認もマージもできる（`people_only()` は `is_agent`・サービスアカウント・ボットだけを拒む）。
  スコープは `api` と `write_repository` までにする。発行は GitStation の画面からだけで、各自が行う。
- GitStation の MCP は stdio のプロセス（`gstn mcp`）で、HTTP の口ではない。各自の PC に `gstn` を入れ、`GSTN_HOST` と資格情報を設定する。
- トークンを Claude Code のチャット、リポジトリのファイル（`.mcp.json`、`.env`）に書かない（Kanflow のトークンと同じ約束）。

## 3. 着手の 1 操作

PBI を選んでから文脈を得るまでを、いまの道具で追う。

| 手順 | いま | 足りないもの（Kanflow） | 足りないもの（GitStation） |
|---|---|---|---|
| PBI を選ぶ | `get_backlog`、`my_tasks`、`get_pbi` | — | — |
| 作業の宣言 | `claim_work`（`pbi` か `taskId`、`sessionId`、`branch?`）。重なれば 409 | — | — |
| 範囲の宣言 | `declare_scope` → `overlaps[]`（ほかの宣言とだけ比べる） | MR の実データとの比較（章 4） | — |
| ブランチ | 名前の案（`suggestBranchName`）は画面にだけ出る。作るのは手元の `git` | 名前の案と、PBI のプロジェクトに結ばれたリポジトリの一覧（GitStation のプロジェクトの id・パス・既定のブランチ）を MCP で返す | ブランチを作る API は無い（セッションには不要。画面から作るなら R2） |
| 下書きの MR | `gstn mr create --draft`（本人）。Kanflow は MR の出来事を同期で受けて結ぶ。`link_merge_request` は手で結ぶ予備 | — | MCP の道具（R1）。差分の無いブランチで MR を作れるか ［未確認］ |
| 文脈 | Kanflow `get_pbi`（本文・受け入れ条件）と、GitStation `get_work_item_context`（結ばれた MR、`@req PBI-n/AC-m` のテスト）を別々に呼ぶ | 1 回で返す道具 | — |

**案: Kanflow の MCP に `start_work` を足す**（スコープ `dev:write`、メンバー。`policy.ts` の `dev.write` をそのまま使う）。

- 入力: `pbi` か `taskId`、`sessionId`、`scope?`、`repository?`
- 中の動き: いまの `claim_work` と `declare_scope` のサービスを順に呼ぶ。宣言が 409 なら、そこで止めて理由を返す。GitStation は呼ばない
- 答え:
  - 作業の宣言と、重なりの警告（宣言・MR が変えたパス・衝突の予測の 3 つの出どころを分けて。章 4）
  - PBI の本文と受け入れ条件（id は `PBI-12/AC-2` の形）
  - ブランチの名前の案、リポジトリの一覧
  - PBI に既に結ばれた MR と、その写し（状態、止まっている理由、検査の結論、読んだ時刻）
  - 次にセッションが打つコマンドの形（`git switch -c …`、`git push -u origin …`、`gstn mr create … --draft`）。これはデータで、Kanflow は実行しない

**利用者から見た 1 操作** は、エージェントモデルのスキルにする（`/kanflow start PBI-12`）: `start_work` → `git switch -c` → 最初のコミット →
`git push -u` → `gstn mr create --draft` → `post_progress`。スキルはエージェントモデルのリポジトリ（別の MR）に置く。

MR の説明に書くもの（スキルの決まりにする）:

- PBI のキーと受け入れ条件の id だけを書く。**PBI の本文は写さない。** 機密かどうかは使う時に確かめる約束（D-5）で、写した本文は、あとで機密になっても残る
- `Kanflow-Session: <sessionId>` を 1 行。どのセッションがどの MR を作ったかを両方からたどれる

「Kanflow が 1 回でブランチと MR まで作る」形（B）は推さない。ブランチの API、代理の許可、確認ページの 3 つが要り、線引きを変える。

## 4. 重なりの確認

いま:

- 作業の宣言の重なり（同じ PBI で、タスクが同じか片方が PBI 全体）は **止める**（409）。4 時間（`DEV_CLAIM_STALE_HOURS`）動きの無い宣言は止めない
- 範囲の重なりは **警告だけ**。比べる相手は、ほかの有効な宣言の範囲だけ（パスは "/" の区切りで前方一致、モジュールは一致）
- 別に、MR が変えたパスと自分の宣言の範囲を比べる検査（`git-scope-check.ts`、範囲の外の件数を `git_link` に持つ）が有る。
  ただし `changedPaths` は GitLab の読み取りにしか実装が無く、**GitStation のリポジトリでは何もしていない**

足す方法（3 段。どれも GitStation の変更は要らない）:

1. **MR が変えたパスを持つ。** GitStation の読み取りに `changedPaths` を実装する。`GET …/merge-requests/{iid}/context` の `files[]` を
   同期のトークンで読み、開いている MR ごとにパスを持つ（上限を決め、`files_truncated` のときは「途中まで」の印を付ける）。
   読むのは、MR の head が変わったとき（`merge_request.opened`、`.pushed`）だけにする。これで、既に有る「範囲の外」の検査が GitStation でも動く。
2. **宣言の範囲と、ほかの人の MR のパスを比べる。** `declare_scope`、`start_work`、`list_claims` の答えと画面に、警告の種類を足す:
   「MR !12（PBI-7）が、この範囲のファイルを変えている」。GitStation には「このパスを変えている MR」を引く API が無いので、
   Kanflow が持つパスから引く。
3. **衝突の予測を持つ。** `merge_request.conflict_predicted` を受けたら、その MR の `/conflicts` を読み、相手の MR・ファイル（最大 100）・
   確かめた時刻・走査の状態を持つ。カードと「開発」パネルに出し、`start_work` と `list_claims` の答えに入れる。

決まり:

- **警告のままにする。** MR のパスと予測では、作業の宣言を止めない。止めるのは、いまと同じ「同じ PBI・同じタスク」だけ
- 警告には出どころを付ける: `declared`（意図）、`mr_paths`（事実）、`predicted`（GitStation の試しのマージ）
- 予測が **消えた** ことを知らせるイベントは無い（ADR-0024 の設計）。予測を持つ MR について、どちらかの MR の `pushed`・`closed`・`merged` と、
  対象のブランチへの push のあとに `/conflicts` を読み直す
- 「予測が無い」は「衝突しない」ではない。走査は相手 50 件・試しのマージ 20 回までで、`scan.status` が `scanned` でないときは「未確認」と出す
- 機密の PBI に結ばれた MR は、トークンへの答え（MCP）とチャットでは出さない。作業の宣言の一覧と同じ扱いにする
  （`dev-work.repository.ts` は、機密の PBI の宣言を問い合わせの段階で落としている）

## 5. カードに出す状態

### 5.1 いまの同期

- 扱う種類: `merge_request.*`（語尾は見ない。MR を iid で特定し、`GET …/merge-requests/{iid}` で今の状態を読み直す）と `repository.pushed`
- **知らない種類は、黙って読み飛ばし、カーソルは進む**（`gitstation-source.ts` の `if (!mergeRequest && e.type !== PUSHED) continue`）。記録も残さない。
  GitStation の文書の約束（知らない欄・知らない種類は読み飛ばす）には合っている
- その結果、`merge_request.conflict_predicted`・`.approved`・`.commented` は「MR を 1 回読み直す」だけになり、`check.completed` は捨てている
- 410（`FG-INT-0007`）のときは、カーソルを取り直し、dev-status を読み直して続ける
- Kanflow の `git_link` は、MR の head のコミットを持っていない（A1 の報告の行だけが持つ）

イベントを決めるときに知っておいてほしいこと: **`merge_request.` で始まる新しい種類は、Kanflow では 1 件につき MR の読み取り 1 回になる。**
数の多い種類（コメントごと、など）を足すと、読み取りがその数だけ増える。

### 5.2 これから出したい状態と、要る項目

| 状態 | いま取れるもの | Kanflow の作業 | GitStation に要るもの |
|---|---|---|---|
| 衝突の予測 | イベント `merge_request.conflict_predicted`（相手の iid、件数。パスは無い）＋ `GET …/conflicts` | 章 4 の 3 | 予測が消えた知らせ、または読み直すきっかけの明記（R6）。dev-status に予測の件数（R5） |
| 実際の衝突 | `merge_request.conflict_detected` / `.conflict_resolved`、`/status` の理由 `conflict` | 理由の表示に含める | — |
| 止まっている理由と、次に押すもの | `GET …/status` の `reasons[{reason, detail}]`（17 種類、順は固定、`detail` は `key=value`）。**次の一手と各国語の文は API に無い** | MR の出来事と `check.completed` のたびに同期のトークンで読み、理由の名前と `detail` を持つ。名前 → 文と次の一手を Kanflow が ja / en / id で持つ（5.3）。ボタンの出し分け（`viewer.*`）は、パネルを開いた時に代理で読む（いまの承認と同じ） | dev-status に `blocked_reasons`（R5）。議論の解決・取り消しのイベント（R7）。理由ごとの「だれの番か」（R13、任意） |
| CI の赤 | `check.completed`（`head_sha`、`name`、`status`、`conclusion`、`previous_conclusion`。結論が変わったときだけ）。dev-status の `checks[]` と `checks_state` | `check.completed` を扱う。`git_link` に head を持ち、head から MR を引く。カードの点（いまのパイプラインの点）に出す | 連携の `event_types` に `check.completed` が入っていること（無いと dev-status の `checks` は null）。M4 の `ci/pipeline` も同じ検査として届くこと |
| キュー待ち | 無い | — | `merge_queue.*` のイベント（入った・出た・失敗した、順番、理由）と、dev-status の項目（R8） |
| デプロイ済み | 無い | — | `deployment.*` のイベント（環境の名前と段、コミット、成否、時刻、**含まれる MR**）と、dev-status の項目（R8） |
| レビューの依頼 | 無い（いまは「承認できる MR」を `/status` の `viewer.can_approve` から出している） | — | 依頼のイベント（依頼された人、依頼した人、時刻）と「私のレビューを待つ MR」の一覧（R8） |

イベントの中身への共通の希望（R8 の材料）:

1. MR に関わるイベントは、`project_id`・`merge_request_id`・`iid`・`head_sha` を必ず持つ（`check.completed` は MR を持たないので、Kanflow が head から引く）
2. 「入る」と「出る」が有る状態は、両方のイベントを出す。出さないなら、どの出来事で何を読み直すかを文書に書く
3. イベントは件数まで。一覧と本文は読み取りの API で取る（いまの `conflict_predicted` の形でよい）
4. 同じ状態を dev-status にも持つ。410 のあとの読み直しが、MR ごとの呼び出しにならないようにする
5. 人は、Kanflow が社員番号に引ける形で持つ
6. 文（理由、検査の本文）は Kanflow ではデータとして扱う。名前（`reason`、`conclusion`）は増えることが有る前提で、知らない名前は「止まっている」として出す

### 5.3 理由 → 次の一手（Kanflow が持つ対応の案）

| 理由 | だれの番 | 次の一手 |
|---|---|---|
| `draft` | 作者 | 下書きを解除する |
| `conflict`、`ff_not_possible` | 作者 | 対象のブランチを取り込む（リベースする） |
| `approvals_missing` | 承認できる人 | 承認する（Kanflow の承認のボタン → GitStation の確認ページ） |
| `codeowner_approval_missing` | `owners=` の人 | 承認する |
| `required_check_missing` | 待つ／作者 | 検査の報告を待つ。`name=kanflow/acceptance` なら Kanflow の側（スプリント、受け入れ条件）を整える |
| `required_check_not_successful` | 作者 | 検査を直す |
| `unresolved_discussions` | 作者・レビューした人 | 議論を解決する |
| `work_item_link_missing` | 作者 | PBI を結ぶ |
| `config_change_needs_maintainer_approval`、`codeowners_invalid` | Maintainer | 承認する／CODEOWNERS を直す |
| `mergeability_unknown`、`merge_in_progress`、`changed_paths_unknown` | 待つ | GitStation が確かめている |
| `not_open`、`source_branch_missing`、`nothing_to_merge` | — | 状態として出すだけ |
| 知らない名前 | — | 「止まっている（名前）」と出し、GitStation へのリンクを付ける |

## 6. GitStation が PBI を読む向き

### 6.1 いまの `/api/v1` で足りるか

- **中身は足りる。** `GET /api/v1/projects/:projectId/backlog/:itemId`（`PBI-12` で引ける）と `…/acceptance-criteria`
  （`id` = `PBI-12/AC-2`、`seq`、`given`・`when`・`then`、`text`、`evidenceKind`）で、本文と受け入れ条件が取れる
- **入り口が足りない。** Kanflow のトークンは人ごとだけで（`ApiToken.userId` が必須）、`/api/v1` はその人の役割で見せる。
  GitStation 用のトークンの種類が無い
- PBI に `title` の欄は無い（`initiative`・`epic`・`userStory`）。計画 02 §4.2 の応答の例は `title` を持つので、どの欄を題名として返すかを決める

### 6.2 案

計画 02 §4.2 の形を、**読み取りだけ** で Kanflow に実装する（`/api/v1` に連携用のスコープを足す形にはしない。人のトークンの規則と混ざるため）。

- 口: `GET /api/integration/v1/projects/{project_id}/work-items/{ref}` と `?refs=PBI-1,PBI-2`。`X-Request-Id` を記録に残す
- トークン: **連携のトークン**（新しい種類）。人に結ばれない。管理者が発行し、GitStation の連携 1 つに 1 つ。
  読めるのは、その連携に結び付けたプロジェクトだけ。スコープは作業項目の読み取り 1 つだけで、書き込みは無い
- だれの目で見るか: GitStation が **見ている人の社員番号を添える**（Kanflow が GitStation に送る `employee:<番号>` の逆向き）。
  Kanflow は、その人がプロジェクトのメンバーのときだけ答える。添えない呼び出しは答えない。
  プロジェクト単位（結ばれていれば全員に見せる）にすると、GitStation の `internal` のプロジェクトでは、Kanflow のメンバーでない人にも本文が見える
- **機密の PBI は、この口ではだれにも返さない。** GitStation は受け取った本文を画面にも AI の文脈にも使うので、
  「MCP と LLM に返さない」（D-5）と同じ判断を口の全体に掛ける。GitStation の画面には、キーと Kanflow へのリンクだけが出る
- 見えない PBI の答え: 無い・消した・機密・その人がメンバーでない・連携に結ばれていないプロジェクト、の **どれも同じ**
  `404 {"error": "PBI not found", "code": "PBI_NOT_FOUND"}`（いまの `/api/v1` と同じ形）。まとめて取る口では、見えないものを理由なしで答えから落とす
- 凍らせない: 答えに `Cache-Control: no-store` を付ける。**GitStation は本文を保存しない**（表示と AI の文脈のたびに読む。
  短い時間のキャッシュを許すなら、分の単位で数字を決める）。イベントや MR の説明に本文を写さない。機密に変わったら、次の読み取りから 404 になる
- AI の文脈: GitStation の AI が社内のローカルの LLM で動く限り、機密でない PBI を渡してよいと考える。
  外の LLM に送る経路が有るなら渡さない ［未確認: GitStation の AI の行き先］
- 受け取った本文は、GitStation でもデータとして扱う（指示として実行しない）。Kanflow は、どの連携が・だれの代わりに・どの PBI を読んだかを記録し、回数の上限を持つ

### 6.3 GitStation を変えずにできる代わり

セッションが MR の説明に PBI のキーと受け入れ条件の id を書き、テストに `@req PBI-n/AC-m` を付ける。
GitStation は今でもキーを持ち（`forge.work_items`）、`context/work-item` で MR とテストを返す。本文は Kanflow へのリンクで読む。

## 7. GitStation 側への依頼の一覧

急ぐ順。**決めるのは GitStation** で、ここは Kanflow から見た希望である。

| 番号 | 依頼 | なぜ | 急ぎ |
|---|---|---|---|
| R1 | `gstn mcp` に道具を足す: MR の状態（止まっている理由）、衝突の予測、検査の一覧、MR の一覧、下書きの MR の作成、コメント | A の構成で、セッションが CLI でなく道具で呼べる。今は文脈の 9 個だけ | 高 |
| R5 | dev-status に項目を足す: `blocked_reasons`（名前）、`mergeable`、衝突の予測の件数、変えたパス（または件数と読む先）、`version_count`・`diff_stats`（G1） | 410 のあとと初回の読み込みが、MR ごとの呼び出しにならない | 高 |
| R6 | 衝突の予測が消えた知らせ。出さないなら、読み直すきっかけを文書に明記 | Kanflow が古い予測を出し続けない | 中 |
| R7 | 議論の解決・解決の取り消しのイベント | `unresolved_discussions` が変わるきっかけが、いまのフィードに無い | 中 |
| R8 | M4 のイベントの中身の案（`pipeline.*`、`deployment.*`、マージキュー、自動マージ、レビューの依頼）を、決める前に見せてほしい。材料は章 5.2 | Kanflow の表示に要る項目を、あとから足さずに済む | 中（M4 に合わせる） |
| R10 | PBI を読む向き（章 6）の合意: 見ている人の社員番号を添える、本文を保存しない、AI の行き先、`title` の扱い | Kanflow が口を実装する前に形を決める | 中 |
| R3 | 代理の読み取りに `CheckRead` を足す | 検査の本文を、その人の権限で画面に出す | 低 |
| R4 | 代理に「下書きの MR の作成」を、確認ページ付きで足す（ADR-0025 の改訂） | 画面とチャットから MR を作る。セッション（A）が有れば急がない | 低（利用者の判断による） |
| R2 | ブランチを作る API（F-2） | 画面から「ブランチを切る」を出す。セッションには要らない | 低 |
| R13 | `/status` の理由に「だれの番か」（作者・承認する人・持ち主・Maintainer・待つ）を足す | 「次に押すもの」を Kanflow が推し量らずに済む | 任意 |
| R12 | 確認: AI 用（`is_agent`）のトークンに `merge_approve`・`merge_execute` を付けられないか。人のトークンをセッションに入れた場合の注意を文書に | 「AI のトークンは承認もマージもできない」を、発行の段階でも守る | 確認 |

運用の作業（依頼ではなく、管理者に頼むこと）:

- R14: A1 を試すプロジェクトで、検査の名前空間 `kanflow` を Kanflow のサービスアカウントに割り当て、Developer にする
- R15: 連携の `event_types` に `check.completed`、`merge_request.conflict_predicted`、`.pushed`、`.approved`、`.unapproved` が入っていることを確かめる

報告（依頼ではない）:

- Webhook は、同じホストの `http` の Kanflow を送り先にできない（ループバックは必ず拒み、`https` だけ）。Kanflow を https にするまで、同期は定期の読み取り（既定 180 秒）のままにする
- 計画 02 §6 の `/api/v1/ai-tools` は、この計画では使わない。Kanflow のチャットの道具は、Kanflow の中のサービス（写し）を呼ぶ

## 8. GitStation の変更なしで今すぐできるもの、順番

| 番号 | 内容 | 大きさ | 前提 |
|---|---|---|---|
| N1 | チャットの道具に、機密の PBI のフィルターを入れる（章 9 の 9）。**利用者の判断を待つ**: ローカル LLM に機密の PBI を渡してよい（計画 06 の D-5）なら N1 は行わず、`CLAUDE.md` §4 の文を直す。渡さないなら N1 を行う | 小〜中 | 利用者の判断 |
| N2 | フィードの同期: `check.completed` と `conflict_predicted` を扱う。`git_link` に head を持つ。知らない種類は種類ごとに数えて debug の記録に出す（失敗にはしない） | 中（マイグレーション有り） | R15 |
| N3 | GitStation の `changedPaths`（`/context`）。「範囲の外」の検査が GitStation でも動く | 小〜中 | — |
| N4 | 止まっている理由を持ち、カードと「開発」パネルに出す（理由 → 次の一手、ja / en / id） | 中 | N2 |
| N5 | 衝突の予測を持ち、カードとパネルに出す | 中 | N2 |
| N6 | 重なりの確認に、MR のパスと予測を足す（`declare_scope`、`list_claims`、画面） | 中 | N3、N5 |
| N7 | MCP: `start_work`。`get_pbi` に、ブランチの名前の案・リポジトリの一覧・MR の写しを足す | 中 | N4〜N6 が有ると答えが揃う（無くても始められる） |
| N8 | エージェントモデルのスキル `/kanflow start`（`gstn` の用意、`is_agent` のトークン、MR の説明の決まり） | 小（別のリポジトリ） | N7 |
| N9 | チャットの読み取りの道具（「PBI-12 の MR はなぜ止まっている」）。写しから答える。LLM が止まっていても、同じ内容が画面に出ている | 小 | N1、N4 |
| N10 | 「自分のタスク」に、承認待ちに加えて「自分の MR で止まっているもの」を出す | 小 | N4 |
| N11 | **マージの履歴**（利用者の要望、2026-11-10）。プロジェクトの Git のページに、マージ済みの MR を新しい順に出す（8.1） | 中（マイグレーション有り） | — |
| N12 | **GitStation のリポジトリを AI の参照資料にする**（利用者の要望、2026-11-10）。1 つのプロジェクトに結んだ複数のリポジトリを、リポジトリごとの切り替えで取り込む（8.2） | 中 | サービスアカウントが Reporter・`read_api`（結び付けで満たす） |

順番: **N12・N11（利用者の要望を先に）→ N2・N3 → N4・N5 → N6 → N7・N8 → N9・N10**。N1 は利用者の判断のあと（N9 は N1 の判断を待つ）。

進み具合（2026-11-12）: N2〜N5・N11・N12 は v2 の線に入った。N1 は D-5 の決定（2026-11-10、チャットは機密の PBI を読んでよい）により作らない。
**N6・N7・N9・N10 を実装した**（ブランチ `feat/L4-NOPBI-gitstation-ops`、`references/decisions.md` 2026-11-12）。
N8（エージェントモデルのスキル `/kanflow start`）は別のリポジトリで、まだ。実際の GitStation につないだ確認は、N2〜N5・N12 と同じく、まだしていない。

### 8.1 N11 マージの履歴

いま有るもの: プロジェクトの Git のページの「最近の動き」（PBI に結ばれた MR・ブランチ・コミットを新しい順に。MR の状態とパイプラインの点）と、
PBI の「開発」パネル。マージだけを並べた表は無い。

- 出すもの: マージした時刻、MR（題名、GitStation へのリンク）、リポジトリ、PBI、作者、**マージした人**、**対象のブランチ**、
  開いてからマージまでの所要。絞り込みは期間とリポジトリ。ページ送り
- データ: `git_link`（MR、`state = merged`）に、題名・作者・`openedAt`・`mergedAt`・リポジトリ・PBI が既に有る。
  足す欄は 2 つ: 対象のブランチ（MR の `target_branch`）と、マージした人（フィードの `merge_request.merged` の `actor`）
- マージした人は、**これから受けるイベントの分だけ** 入る。過去のマージには入らない（MR の読み取りに `merged_by` の欄が無い）。空のときは「—」と出す
- **PBI に結ばれていない MR は出ない。** Kanflow は PBI に結ばれた MR だけを持つ（`git_link.backlogItemId` は必須）。
  表に「PBI に結ばれた MR だけ」と書き、全部の一覧は GitStation へのリンクにする。結ばれていない MR も持つかは、使ってみてから決める
- 見られるのはプロジェクトのメンバー（いまの「最近の動き」と同じ）。機密の PBI に結ばれた行は、画面には出し、MCP とチャットには出さない
- 止まっている理由・衝突の予測・検査は N2〜N5、パイプラインの一覧は章 1.4 の 18（同期のトークンで読める）で足す

### 8.2 N12 GitStation のリポジトリを AI の参照資料に

いま: 参照資料（リポジトリごとの切り替え `aiKnowledge`、対象のパス `aiPathFilter`、断片は `repo_chunk`）は、GitLab のリポジトリでだけ動く。
GitStation のリポジトリは「まだ使えません」と答える（`gitstation-source.ts` の `readsRepositoryFiles: false`）。
1 つのプロジェクトに複数のリポジトリを入れること自体は、既にできている（リポジトリごとに切り替えと取り込みの状態を持つ）。

- GitStation の読み取り（どれも Reporter・`read_api`。同期のサービスアカウントで読める）:
  既定のブランチの先頭 = `GET …/repository/refs`、木 = `…/repository/tree?ref=&path=`（**1 階層ずつ**。上限を超えると `truncated`）、
  差分 = `…/repository/compare`、中身 = `…/repository/blob?ref=&path=`（文字は 1 MiB まで。超えると `truncated`、バイナリは `binary: true`）
- 取り込み: 木を 1 階層ずつたどる（GitLab は 1 回で全部）。1 回の要求は 10 秒までで、リポジトリごとの上限も有るので、
  いまの「途中から続ける」仕組み（`indexCursor`）に載せ、ファイルの数の上限（`MAX_INDEX_FILES`）と要求の数の上限を守る
- **飛ばすもの（失敗にしない。件数を持つ）**: 機密の印の有るパス（GitStation が AI・サービスアカウントに拒む。`FG-AUTH-0022`）、バイナリ、切られた中身。
  機密の印の有るファイルは Kanflow に入らないので、チャットにも MCP にも出ない
- 出典のリンクは GitStation のファイルの画面にする。道具の説明と画面の文から「GitLab」だけを指す言い方を直す（ja / en / id）
- ローカル LLM が止まっていても、取り込みと検索は動く（いまと同じ）。GitStation が止まっているときは、前に取り込んだ断片で答え、状態に失敗を出す
- 取り込んだ中身はデータとして扱う（指示として実行しない）。秘密の伏せ（`repo-redact.ts`）は GitLab と同じものを通す

- それぞれ、v2 の線から自分の worktree とブランチを切り、lint・型・テスト（PG の DB テストを含む）と、計画 11 §5.6 のレビュー担当の確認を通す
- 新しい操作を足すときは、`policy.ts` に行を足し、`policy.test.ts` に許す行と拒む行を足す。画面の文は ja / en / id、保存する文は日本語にする
- GitStation を待つもの: 画面からの MR の作成（R4）、ブランチ（R2）、パイプライン・デプロイ・キュー・レビューの依頼（M4）、PBI を読む向き（R10 の合意のあとに Kanflow の口を作る）

## 9. 指示と食い違ったところ（コードを正とする）

| # | 指示の記述 | コードで確かめたこと |
|---|---|---|
| 1 | セッションは「GitStation の MCP」をつなぐ（A） | GitStation の MCP は stdio のプロセス（`gstn mcp`）で、HTTP の口ではない。道具は読み取り 9 個（文脈・要件・文書）で、MR の状態・衝突・検査・MR の作成は無い。A で操作するには CLI の `gstn` が要る |
| 2 | API は `gstn` の幅まで有る | そのとおり。ただし **ブランチを作る API は無い**（`git push` だけ） |
| 3 | 代理で呼べるのは「読み取り・承認と取り消し・結び付け」 | 読み取りは、プロジェクトと MR の読み取り・一覧（`/status`、`/conflicts`、`/context`、差分、議論、承認の一覧を含む）と、リポジトリの検索だけ。検査（`CheckRead`）、`context/work-item` と `context/requirement`（`ContextRead`）、要件、文書、フィード、dev-status は代理では拒まれる |
| 4 | AI・サービスアカウント・ボットのトークンは承認もマージもできない | そのとおり。ただし `is_agent` の無い個人のトークンは、スコープが有れば承認もマージもできる。セッションに入れるトークンを `is_agent` に限る決まりが要る（章 2） |
| 5 | Kanflow の MCP に開発の道具が有る | そのとおり。「着手」をまとめる道具は無く、`get_pbi` はブランチの名前の案を返さない。PBI に `title` の欄は無い。開発の道具のスコープは `dev:write` |
| 6 | `/api/v1` に受け入れ条件（`acRef`）が有る | `acRef` はパスの引数（`AC-2`、`2`、`PBI-12/AC-2`）で、答えの欄ではない。答えの `id` が `PBI-12/AC-2` |
| 7 | GitStation が `/api/v1` を読む | Kanflow のトークンは人ごとだけ。GitStation 用のトークンの種類を新しく作る必要が有る（章 6） |
| 8 | 宣言の重なりの判定に GitStation のデータを足す | いまは Git のデータを 1 つも使っていない。「範囲の外」の検査は GitStation のリポジトリでは動いていない（`changedPaths` が GitLab にしか無い） |
| 9 | 機密の PBI は MCP とローカル LLM に返さない | MCP と `/api/v1` は守っている。**チャットの道具（`lib/chat-tools.ts`、`analysis-tools*.ts`、`proposal-tools.ts`、`schedule-tools.ts`、`repo-knowledge-tools.ts`）には機密のフィルターが無い。** フィルターが有るのは計画の LLM（`lib/plan-llm/visible.ts`）だけ。**決まりの文どうしが食い違っている**: D-5 の元の文（GitStation の計画 06 §D-5）は「機密の高い仕様は Qwen（ローカル）だけ」、Kanflow のスキーマの注釈（`schema.prisma` の機密の欄）と `docs/api-v1.md` は「Claude 向けの MCP と `/api/v1` に返さない。サインインした画面には出す」。`CLAUDE.md` §4 と指示の §4 は「MCP と LLM に返さない」。チャットはローカル LLM で、データはサーバーの外に出ないので、元の D-5 には合っている。**どちらを正とするかは利用者が決める**（2026-11-10 の最初の報告で「穴」と書いたのは言い過ぎだった） |
| 10 | 代理の許可は ADR-0025 §4 のとおり | リポジトリの検索（その人として、連携ごとに毎分 30 回）と、結び付けの設定・解除（確認付き）も入っている |
| 11 | フィードに `conflict_predicted` が有る | 有る。ただし Kanflow は語尾を見ずに MR を読み直すだけで、予測そのもの（`/conflicts`）は読んでいない。知らない種類は黙って読み飛ばす |
| 12 | Kanflow は `ed7a74a` | GitStation へ検査を報告する側（A1 = `ba3b320`）と、MCP から全体計画に書く道具（C2 = `f982659`）は、この計画を書いた時は v2 の線に入っていなかった。2026-11-10 に取り込んだ（v2 の線は `882ff48`） |
| 13 | パイプラインの API はまだ無い（M4） | `059cc34` で、一覧・1 件・実行・取り消し・やり直しが入った（章 1.4）。ログ・成果物・`pipeline.*` のイベントは無い。代理は拒まれる |

## 10. 守る線（この計画の全部に掛かる）

- 承認は、本人が GitStation の確認ページを押した後だけ。MCP とチャットには承認の道具を出さない
- マージと本番のデプロイは、どの入り口からも実行しない
- Kanflow の MCP は GitStation に書かない。Kanflow の代理の許可を、この計画では広げない（R3・R4 は、利用者と GitStation が決めた後）
- 機密の PBI は、MCP と GitStation に返さない。判断は使う時に行い、写しを残さない。ローカル LLM に渡すかは、章 9 の 9 の判断による
  （計画の LLM は今も渡さない。チャットは今は渡している）
- GitStation から来た文（理由の `detail`、検査の `summary` と `annotations`、MR の題名と説明、コメント）はデータである。
  画面には文として出す。**ローカル LLM には、検査の本文とコメントを渡さない**（名前と結論だけ）。渡す文は長さを切り、道具の呼び出しの引数に使わない
- ローカル LLM が止まっていても、同期・表示・承認・MCP は動く。チャットの道具が答える内容は、画面でも見られる
- 本番（`D:\APP\KanflowV2`）と v1（`D:\APP\Kanflow`）に触らない。push は利用者が言ってから

## 11. 前の案との関係

`gitstation-deeper-integration.md`（2026-11-10 の前の案）の A5 はこの計画の章 3、A6 は章 4 に入れた。A1（`ba3b320`）と C2（`f982659`）は実装し、v2 の線に取り込んだ（`882ff48`）。A2（受け入れ条件の証拠）と A4（所要を分ける）は、この計画の外で、前の案のまま残す。
A3（Webhook）は、Kanflow の https のあとにする。

## 12. 決まったこと（2026-11-10、利用者「推奨で進めて欲しい」）

下の 10 件は、どれも推奨のとおりに決まった: 構成は A、各自が `gstn` と AI 用のトークンを用意する、画面・チャットからの MR の作成は求めない
（画面は「コマンドをコピー」まで）、チャットは読み取りとリンクまで、重なりは警告だけ、PBI を読む口は「見ている人の社員番号・機密は返さない」で
GitStation との合意（R10）のあとに作る、A1 と C2 は v2 の線に取り込む（済み）、GitStation 側にはこの文書のパスを伝える。
順番は章 8 のとおりに変えた（N12・N11 を先に）。

**残る 1 件**: ローカル LLM（チャット）に機密の PBI を渡してよいか（章 9 の 9）。決まるまで N1 は行わず、チャットの動きは変えない。

聞いた時の文（記録として残す）:

- **MCP の構成**: A（セッションが両方を本人のトークンで呼ぶ。Kanflow の MCP は写しを返し、GitStation には書かない）でよいか
- **各自の用意**: 開発する人が、自分の PC に `gstn` を入れ、AI 用（`is_agent`）の GitStation のトークンを自分で発行する運用でよいか
- **画面・チャットからの MR の作成**: 求めるか。求めるなら、GitStation に ADR-0025 の改訂（R4）を依頼する。
  求めないなら、画面は「コマンドをコピー」まで、作成はセッションに任せる（推奨）
- **チャットから GitStation に対してできること**: 読み取りと、画面へのリンクまで（承認もマージも出さない）でよいか
- **チャットの機密の穴（N1）**: 最初に直してよいか。いまの本番にも有るので、直したら、ほかを待たずに本番に出すか
- **重なりの警告**: MR のパスと衝突の予測は警告だけにして、作業の宣言を止めない、でよいか
- **GitStation が PBI を読む向き**: 口を作るか。作るなら、(1) 見ている人の社員番号で絞る（推奨）か、プロジェクト単位か、
  (2) 機密の PBI は人にも返さない（推奨）でよいか、(3) GitStation の AI の文脈に、機密でない PBI を渡してよいか
- **順番**: N1 → N2・N3 → N4・N5 → N6 → N7・N8 → N9・N10 でよいか
- **取り込み**: A1（`ba3b320`）と C2（`f982659`）を v2 の線に取り込んでよいか（push と本番への反映は、別に聞く）
- **GitStation 側への返し方**: この文書のパスを GitStation 側のセッションに伝える形でよいか（GitStation のリポジトリには書かない）

# GitStation 連携の約束への追加の提案（Kanflow K3 から、2026-11-03）

GitStation のセッションへ。Kanflow の GitStationSource（計画 11 の K3、ブランチ `feat/L4-git-gitstation-source`）を、計画 02 の §5.1・§5.2・§5.7・§5.8・§11.2 に沿って偽の GitStation に対して作った。そのとき **02 に書かれていない形**を仮に決めたので、02 に取り込むかどうかを決めてほしい。仮の形は Kanflow のテストの偽の GitStation（`app/src/services/git/__tests__/fake-gitstation.ts`）が固定している。I1 の実装で形が変わるときは、02 を先に直し、この文書と偽の GitStation を合わせる（引き継ぎ文書 §5 の約束）。

印: **［仮］** = Kanflow が仮に決めた形（02 に無い）。**［02］** = 02 にあり、そのとおりに使っている。

## 1. Kanflow がどう読むか（02 に合わせた点）

| 点 | 内容 |
|---|---|
| 認証 ［仮］ | `Authorization: Bearer <サービスアカウントのトークン>`。02 §5.1 は「サービスアカウントのトークン」とだけ書き、ヘッダを決めていない。Kanflow の `/api/v1` と同じ Bearer にそろえた |
| 連携の ID ［仮］ | Kanflow のプロジェクトの設定に、GitStation の管理者が登録した連携の ID（不透明な文字列、`^[A-Za-z0-9_.:-]{1,64}$`）を入れる。URL のパスに入れるときは符号化する |
| ベース URL ［02］ | `https://<host>/api/v1`。ホストは Kanflow の `GIT_ALLOWED_HOSTS` に載っているものだけ。リダイレクトはたどらない |
| カーソル ［02］ | 不透明な文字列として保存して返すだけ（読まない）。Kanflow の側では `gitstation:v1:<GitStation のカーソル>` として保存する |
| 読む単位 ［02］ | **連携ごとに 1 つのカーソル**（サービスアカウントのトークンごとに分ける）。1 回の定期取得で履歴を 1 回だけ読み、`data.project` と `work_items[].project_id` で Kanflow のリポジトリに振り分ける |
| 初回・再同期 ［02 §11.2 に合わせた］ | `after` は付けない読み方をしない。初回と「過去分を再同期」は、410 からの復旧と同じく `/events/cursor` → 開発状況の取り直し（§2.1）→ 取っておいたカーソルから、の順。**その位置より前にリンクされたコミット（`commit.linked`）は取り直せない**（コミットの一覧が約束に無いため。足すかどうかは §4 の 6） |
| 410 ［02］ | `reason` の 4 種類すべてで、`/events/cursor` → 開発状況の取り直し → 取っておいたカーソルから、の順。Kanflow は理由を警告として記録する。1 つのリポジトリの取り直しが失敗しても他のリポジトリの復旧は止めず、そのリポジトリだけを「取り直しが要る」と印を付けて次に取り直す。`/events/cursor` が取れないときは読み始めの位置を保つ |
| 読み手 ［Kanflow の中］ | 1 つの履歴を同時に読むのは 1 つだけ（Kanflow の中のリース）。カーソルの保存は「読み始めの位置・世代・リース」が変わっていないときだけ |
| 形の検査 ［仮］ | `next_cursor` が空・2048 文字を超える・`has_more = true` なのに進まない、は不正な応答として扱い、位置を保つ。応答は 4 MiB までしか読まない（02 は 2 MiB まで） |
| 400 FG-INT-0008 ［02］ | 位置を変えず、利用者に「過去分を再同期」を案内する |
| 429・503 ［02］ | `Retry-After` を守って 2 回まで再試行（10 秒を超える待ちは次の定期取得へ） |
| 重複 ［02］ | `id`（`evt_…`）で除く |
| 知らない種類 ［02］ | 読み飛ばす |

## 2. 02 に足してほしい形

### 2.1 連携の範囲の開発状況の一覧 ［仮］（410 からの復旧に必要）

02 §5.2 の開発状況 API は **作業項目ごと**（`/work_items/{provider}/{ref}/dev_status`）しかない。410 からの復旧（02 §11.2「開発状況 API（`state=all`）で全体を取り直す」）を作業項目ごとに行うと、Kanflow の全 PBI について 1 回ずつ呼ぶことになる。リポジトリごとにまとめて取れる一覧を提案する。

```
GET /api/v1/integrations/{id}/dev_status?project=<リポジトリのパス>&state=all&cursor=<不透明>&limit=100
```

```json
{
  "merge_requests": [
    { "project": "app/portal", "iid": 87, "title": "Login form (PBI-123)", "state": "open",
      "source_branch": "feature/PBI-123-login-form", "url": "https://<host>/app/portal/-/merge_requests/87",
      "author": { "name": "Dev One" }, "updated_at": "2026-10-26T10:15:00+09:00", "merged_at": null }
  ],
  "next_cursor": "…",
  "has_more": false
}
```

- 連携に結び付いたリポジトリで、作業項目にリンクした MR だけ（§5.7 の「対象を絞る」と同じ判定）。結び付いていないリポジトリは 404。
- `state`: `open` / `merged` / `closed`（`locked` があれば足す）。Kanflow は `open` を `opened` と読み替える。
- `author.name` は表示名（email は入れない。§11.1 の `actor` の決まりに合わせる）。
- 2000 件（100 件 × 20 ページ）を超えるリポジトリは、Kanflow では取り直しの失敗として扱う（途中で切れた状態を正しいと見なさない）。
- 計画 12 の G1 で足す `opened_at`・`version_count`・`diff_stats` も同じ形に入る（足すだけ）。

### 2.2 `merge_request.*` のイベントの `data` ［仮の項目を含む］

02 §5.7 の例は `project`・`iid`・`title`・`merged_by`・`source_branch`・`url`。Kanflow が使う項目を次のように決めた。

| 項目 | 必須 | 内容 |
|---|---|---|
| `project` ［02］ | ○ | リポジトリのパス |
| `iid` ［02］ | ○ | プロジェクトの中の連番 |
| `title`・`source_branch`・`url` ［02］ | ○（`source_branch_deleted` などは省略可） | その時点の値 |
| `state` ［仮］ | **すべての `merge_request.*` で ○** | イベントの後の状態（`open` / `merged` / `closed`）。Kanflow は状態を**種類（opened・reopened・merged・closed）からだけ**決め、それ以外のイベントの `state` は、その MR の状態をまだ知らないときにだけ使う（知っている状態は変えない） |
| `merged_at` ［仮］ | `state = merged` のとき ○ | マージの時刻。マージの後のイベント（`source_branch_deleted` など）にも入れる。無いと Kanflow はマージの時刻を消してしまう |
| `author` ［仮］ | 任意 | `{ "name": "表示名" }`。email は入れない |

`work_items` は 02 §5.7 のとおり（`provider`・`project_id`・`ref`）。**Kanflow は `work_items` に自分のプロジェクトが無いイベントを、パスが一致しても取り込まない**（他のプロジェクトへの漏れを防ぐ）。作業項目にリンクしていないイベントは連携の履歴に出ない、という §5.7 の約束を続けてほしい。

### 2.3 `commit.linked` の `data` ［仮］

```json
{ "project": "app/portal", "sha": "<40 桁>", "title": "1 行目", "message": "メッセージ全体",
  "url": "https://<host>/app/portal/-/commit/<sha>", "author_name": "表示名", "committed_at": "…" }
```

### 2.4 リポジトリの読み取り ［仮］

02 §5.2 は `GET /projects/{id}`・`/projects/{id}/branches` を挙げるが、`{id}` の形と応答の形が無い。Kanflow は **パスを URL 符号化したもの**（`app%2Fportal`）を `{id}` として使う。

```
GET /api/v1/projects/{符号化したパス}
→ { "id": "prj_…", "path": "app/portal", "web_url": "https://<host>/app/portal", "default_branch": "main",
    "kanflow_project_ids": ["<このリポジトリを結び付けた Kanflow のプロジェクト ID>"] }

GET /api/v1/projects/{符号化したパス}/branches?search=pbi&cursor=&limit=100
→ { "branches": [ { "name": "feature/PBI-3-form", "url": "…", "commit": { "title": "…", "author_name": "…", "committed_at": "…" } } ],
    "next_cursor": null, "has_more": false }

GET /api/v1/projects/{符号化したパス}/tags?cursor=&limit=100
→ { "tags": [ { "name": "v1.0.0", "url": "…", "commit": { "committed_at": "…" },
               "release": { "name": "…", "description": "…", "released_at": "…" } | null } ],
    "next_cursor": null, "has_more": false }
```

- 接続テストは `GET /projects/{パス}` が 200 で、**`kanflow_project_ids` に Kanflow のそのプロジェクトが入っているとき**だけ成功。見えないものは 404。
- **`kanflow_project_ids` ［仮］は安全のために必須にし、ちょうど 1 つ（そのプロジェクトだけ）であることを求める。** 開発状況の取り直し・ブランチ・タグには `work_items` が無いので、複数の Kanflow のプロジェクトに結び付いたリポジトリは、項目ごとに絞り込む代わりに読まない（02 §2 は 1 つのリポジトリを複数の Kanflow のプロジェクトに結び付けることを禁じているので、正しい設定では起きない）。 サービスアカウントのトークンは連携のすべてのプロジェクトで共有されるので、パスだけで読むと、Kanflow の別のプロジェクトがそのリポジトリを登録してブランチの名前とタグを読めてしまう。Kanflow は追加の時と毎回の定期取得の前に確かめ、結び付けが無ければそのリポジトリを読まない（02 §2「1 つのリポジトリを複数の kanflow のプロジェクトに結びつけることは禁止」の結び付けを、Kanflow から確かめる手段）。
- ブランチは「消えたブランチ」を見分けるために一覧の全体が要る。`has_more = true` の間は、Kanflow はブランチを「削除済み」にしない。
- 一覧の `cursor`・`next_cursor`・`has_more` は §5.1 のカーソル方式に合わせた（`Link` ヘッダは使っていない）。

## 3. M3 の間は使わないもの

| もの | 理由 |
|---|---|
| パイプラインの状態 | 02 §5.8 の段階で M4。Kanflow は `null` を返す（「開発」タブに出さない） |
| MR の変更されたファイル（W4 の触る範囲） | 02 に無い。Kanflow は確かめを飛ばす（任意の機能） |
| リポジトリのファイル（AI の参照資料） | 02 に無い。GitStation のリポジトリは索引に入れない |
| `work_item.linked` / `unlinked` | Kanflow はまだ題名・ブランチ・メッセージの PBI 番号でリンクを作る。GitStation で手動で付けたリンクを反映するのは次の段（`work_items` を正にする） |

## 4. 決めてほしいこと（GitStation 側）

1. §2.1 の連携の範囲の開発状況の一覧を I1 に入れるか（入れないなら、410 からの復旧の手順を 02 §11.2 で決め直す）。
2. §2.2 の `state` と `merged_at` を、すべての `merge_request.*` の `data` に必ず入れるか。
3. `after` を省いたときの意味（見える最も古いイベントから）。
4. §2.4 の `{id}` に符号化したパスを使ってよいか（不透明な `prj_…` だけなら、Kanflow は接続テストで ID を取って保存する形に変える）。
5. §2.4 の `kanflow_project_ids`（リポジトリを結び付けた Kanflow のプロジェクト）を返してよいか。返さない場合は、同じ確かめができる別の道（例: 連携の結び付けの一覧）を決めてほしい。
6. 取り直しの後にコミットのリンクを失わないため、リポジトリごとの `commit.linked` の一覧（開発状況の一覧と同じ形）を足すか。足さない場合、再同期の前にリンクしたコミットは Kanflow に出ない（MR とブランチは出る）。

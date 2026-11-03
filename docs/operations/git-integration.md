# Git integration (Git 連携: GitLab, GitStation)

Optional, per project, **off by default**. Kanflow is also used by
process-improvement teams that never touch Git: while a project has it off,
nothing Git-related is shown (no sidebar entry, no panels, no badges).

## What it does when on

| Where | What |
|---|---|
| Sidebar → 実行 → 開発（Git） | Repository status, 今すぐ同期, latest merge requests / branches / commits with their PBI |
| PBI detail → 開発 panel | Linked merge requests (state, pipeline), branches, commits per repository; copy the PBI key and a branch name |
| Sprint board / backlog cards | Small badge: open merge requests, merged, pipeline status |
| Option マージで自動完了 | When **every** merge request of a PBI is merged, its in-progress tasks of the active sprint become done (activity log shows "GitLab") |

**Linking rule:** a branch name, merge request title or commit message that
contains the PBI number — `PBI-123`, `pbi_123`, `PBI 123`, `PBI123`, `PBI #123`
or `PBI#123` — is linked to PBI #123 of that project. Suggested branch name: `feature/PBI-123-<title>`.
Several repositories per project are supported (front end, API, edge …); links
from all of them gather on the same PBI.

## How data arrives: polling

GitLab (`gitlab.scm.service.infosys.yamaha.com`) runs on Google Cloud and is
reached over the internet; it cannot call back into the LAN, so **webhooks are
not possible** (checked 2026-10-02: route PP-21 → ISP → Google, no private
link). Instead the web process polls:

- every `GIT_SYNC_INTERVAL_SEC` (default 180 s), each repository of an enabled
  project: merge requests and commits changed since their cursors (first sync:
  30 days back), plus the current branches containing "pbi";
- one tick at a time (no overlap), repositories one after another; within a
  repository the listings run one after another (merge requests, commits,
  look-back, branches) but independently: one failing does not stop the others;
- 今すぐ同期 on the Git page / PBI panel syncs a project immediately (at most
  once per 20 s per project).

**Branch and merge request links are the primary PBI signal.** Commits add
detail, but GitLab finds a commit only by its own date (see the look-back
below), so name the branch or the merge request after the PBI.

### Source (provider): one per project

The sync reads through a thin, swappable layer, **DevSource**
(`app/src/services/git/dev-source.ts`): merge requests and commits changed
since a cursor, branches, pipelines and tags, as normalized records. Two
implementations: **GitLabSource** (`gitlab-source.ts`, polled REST v4) and
**GitStationSource** (`gitstation-source.ts`, GitStation's integration event
feed — see "GitStation (M3 K3)" below).

- `git_integration.provider` names the source: `gitlab` (the default; migration
  `20261030140000_git_integration_provider`) or `gitstation` (migration
  `20261103120000_gitstation_feed`, with `git_integration.stationIntegrationId`).
  Any other value is refused by the settings API (`PUT …/git` `{ provider }` → 400
  `GIT_PROVIDER_UNSUPPORTED`), by リポジトリ追加 and 過去分を再同期 (400), by the
  sync (the repository shows the message; nothing is read), by the knowledge
  index (manual run fails with the message; the background tick and the AI
  search skip such projects). Log `git provider unsupported` (error) once per
  repository and process — not every poll. There is no fallback to GitLab.
- **A project reads exactly one source.** `git_integration` is one row per
  project (primary key), and its provider cannot change while the project has
  repositories (409 `GIT_SOURCE_LOCKED`: remove the repositories first). Once a
  repository moves to GitStation, GitLab is only its mirror and is not read —
  reading both would show every merge request and commit twice. A provider
  change and a repository addition each check and write under a row lock on
  the project (`SELECT … FROM Project … FOR UPDATE` in one transaction), so
  they cannot both pass concurrently; リポジトリ追加 re-checks provider, limit and
  duplicate under the lock after its connection test.
- **The cursor is opaque.** The sync stores the source's cursor and hands it
  back without looking inside. GitLabSource's cursor is the per-listing
  position below, serialised as `gitlab:v1:<json>` and kept in the existing
  `git_repository` columns (no data migration; a cursor another source wrote is
  refused, never "started over").
- **Unreadable position.** A stored position that cannot be read (corrupt
  date, foreign cursor) fails the sync with its own message (「同期位置の記録を
  読み取れません…過去分を再同期…」, shown in the viewer's language; log
  `git sync failed`, error). 過去分を再同期 is the escape hatch: every source
  computes the reset from the repository row alone and never decodes the
  stored cursor (DevSource contract, tested for every source).

#### Done in M3 K3 (GitStationSource)

- GET settings returns `provider` and `stationIntegrationId`; チーム設定 has a
  取り込み元 selector (locked while repositories exist) and the 連携 ID field.
- `syncRepository(id, clients: DevClients)` takes provider-neutral clients.
- The activity log names the source of an automatic completion
  (`gitActor(provider)`: "GitLab" / "GitStation").
- 接続テスト / リポジトリ追加 go through the source (`locate`); the knowledge index
  only indexes sources that can read files (`DevSourceKind.readsRepositoryFiles`:
  GitLab yes, GitStation not yet — its file API is not in the contract) and
  the AI search lists only those (`indexableProviderFilter`).

### GitStation (M3 K3): the integration event feed

GitStation offers what GitLab cannot: an **event feed** per integration
(plan 02 §5.7 / §11.2, `GET /api/v1/integrations/{id}/events?after=…`), in
order, with an opaque cursor, so nothing that happens between two polls is
missed — a merge request opened and closed inside one interval arrives as both
events, and a merge request closed without merging arrives as
`merge_request.closed` (the 02 §8.2 problem of the GitLab polling).

**One cursor per integration, not per repository** (`git_station_feed`). One
GitStation integration (one service account) covers up to 200 repositories,
possibly of several Kanflow projects. Reading the feed once per repository
would read the same events N times and let N cursors over one feed drift
apart. So `gitstation-feed-sync.ts` sits above the per-repository DevSource:
every poll it reads each feed **once**, hands each Kanflow repository its slice
(`changesFor`), writes every repository through the same code as the GitLab
sync (`git-sync.applyRead`: links, auto-complete, notifications, releases,
gone branches), and only then saves the feed cursor. If any repository could
not be written, the cursor stays (re-reading is idempotent; log
`gitstation feed cursor kept: a repository was not written`). This was the
smallest change that keeps the GitLab path untouched: the GitLab sync still
reads per repository with its own cursor columns; the DevSource contract
(codec, `readChanges`, branches, tags, errors) is implemented by
GitStationSource too and tested by the same `dev-source-contract.ts`.

| Point | Rule |
|---|---|
| Feed key | `(apiBase, integrationId, SHA-256(token)[:32])`. Different tokens may see different things, so they get different feeds. The token itself is never stored there |
| Binding | A repository must be bound in GitStation to the repository's own Kanflow project (`kanflow_project_ids` of `GET /projects/{path}`): checked by 接続テスト / リポジトリ追加 and again on every poll before its branches and tags are read (the service-account token is shared by every project of the integration). Not bound → 「このリポジトリは GitStation でこのプロジェクトに結び付けられていません…」 on that repository; the others go on |
| Routing | An event reaches a Kanflow repository only when its `data.project` is the repository's path **and** its `work_items` name a work item of the repository's own Kanflow project (`provider = kanflow`, `project_id`). Another project registering the same path never sees the events |
| Cursor | `gitstation:v1:<GitStation cursor>` in `git_station_feed.cursor`, never parsed. Empty = read the feed from its beginning (all GitStation keeps: 90 days by default) |
| Dedupe | At least once: the same event id (`evt_…`) is kept once per read; writes are idempotent across reads |
| Unknown / unused event types | Skipped (pipelines and deployments are M4 in GitStation; `work_item.linked` is not used yet — links still come from the PBI key in the title / branch / message) |
| 410 `FG-INT-0007` | Any reason (`retention`, `epoch_mismatch`, `ahead_of_head`, `visible_set_changed`): log `gitstation feed restarted` (warn, with the reason), take `GET …/events/cursor` first, re-read every repository's merge requests through the dev-status listing (`state=all`), then read the feed from the position taken first. If the re-read fails, the old position is kept and the next poll tries again — never a silent jump |
| 400 `FG-INT-0008` | The position is kept and every repository of the feed shows 「同期位置の記録を読み取れません…過去分を再同期…」 |
| 429 / 503 | Retried up to 2 times inside the poll, waiting `Retry-After` (at most 10 s; longer = next poll). Then a failure ("次回の同期で再試行します") with the position kept |
| 過去分を再同期 | Restarts the repository's feed (cursor emptied, generation bumped so a read already running does not write its cursor back). The next read re-reads everything GitStation keeps |
| 今すぐ同期 | Reads the repository's whole feed (all repositories of that feed are written: the shared cursor must not pass their events) |
| Pipelines | `null` until GitStation puts pipelines in the feed (M4) |
| Requests | `Authorization: Bearer <service-account token>`, 15 s timeout, `redirect: "error"` (the token never follows a redirect), host limited by `GIT_ALLOWED_HOSTS` like GitLab |

Settings for a project on GitStation: チーム設定 → Git 連携 → 取り込み元
「GitStation」, the 連携 ID GitStation's administrator gave the integration,
and the integration's service-account token as the access token. Add
`gitstation.<host>` to `GIT_ALLOWED_HOSTS`. Repository URLs are GitStation's
`https://<host>/<group>/<repo>`.

Shapes GitStation's plan 02 does not define yet (dev-status listing per
repository, branches, tags, `commit.linked` data, the fields of
`merge_request.*` events) are proposed in
`docs/integration/gitstation-contract-proposal.md`; the fake GitStation of the
tests (`__tests__/fake-gitstation.ts`) pins them until GitStation's I1 lands.

### Cursors (one per listing, GitLab)

Each listing keeps its own position on `git_repository`, so a busy or failing
listing never holds back the other:

| Listing | Cursor | Per sync |
|---|---|---|
| Merge requests | `mrCursorAt` = GitLab's `updated_at` of the last merge request read (GitLab's clock, never Kanflow's) + `mrCursorSeen` = how many with exactly that `updated_at` were read (tie-breaker) | 1 overlap page (5 min before the cursor; catches changes that became visible late) + up to 5 pages of 100. Every page is anchored at the last `updated_at` seen, so an MR edited during the read cannot shift a page boundary; a tie of ≥ 100 MRs (bulk edit) is paged within the tie, re-reading 5 MRs for safety |
| Commits | `commitCursorAt` = start of the next time window, `commitWindowSec` = its width | up to 4 windows of ≤ 3 pages. A window read completely moves the cursor and doubles the width (max 7 days); a cut-off window is retried at a quarter of the width (min 60 s). Windows end at GitLab's clock (response `Date` header); the cursor stays 10 min behind it, so the newest minutes are re-read every sync |
| Look-back | `lookbackCursorAt` / `lookbackWindowSec` (pass in progress), `lookbackAt` (last start) | up to 3 windows; see below |
| Branches | none (the whole list each sync) | 3 pages of 100 |

**GitLab ordering this relies on (assumption, not verified against our
instance).** The merge request listing uses `order_by=updated_at&sort=asc`
with `updated_after`, which GitLab documents as "updated on or after the given
time" ([List project merge requests](https://docs.gitlab.com/ee/api/merge_requests.html#list-project-merge-requests)),
with offset pagination ([REST API pagination](https://docs.gitlab.com/ee/api/rest/#pagination)).
The tie-breaker additionally assumes that merge requests with the *same*
`updated_at` come back in the same order on every request (GitLab's sorted
finders add the primary key as a secondary order; the documentation does not
promise it for this endpoint). Defences in the code: a page whose `updated_at`
decreases, lies before `updated_after` or cannot be parsed is logged once per
sync (`git sync merge request order unexpected`, warn) and never moves the
cursor — the tie is re-read from offset 0; a tie smaller than a page is always
re-read from offset 0; in a larger tie every page re-reads at least one already
read MR, and if those are no longer at the tie's `updated_at` (MRs left the tie
between syncs, shifting the offsets) the tie is re-read from offset 0
(`git sync merge request tie changed`, info).

Every listing either moves its cursor or narrows its window, and the width is
stored, so a backlog (first sync of a busy repository, a large import) is
worked off over several syncs and **never stalls**. Log line `git sync backlog`
(info) shows the progress; `git sync stalled` (error) would mean the merge
request cursor did not move during a whole sync (a bug — report it).

**More than 300 commits in one minute** (a large rebase or import): the 60 s
window that is still cut off is skipped — the 300 commits it returned are
linked, the rest of that minute is not — and the sync moves on. Log line
`git sync commit window skipped` (warn) with the window and the number of
consecutive skips; from the 3rd skip in a row (`commitSkips`) it is logged as
`git sync commit window skipped repeatedly` (error): the repository commits
faster than the sync can read, so link by branch / merge request.
**Accepted limitation:** the commits beyond the first 300 of such a minute are
not linked by the automatic sync, and 過去分を再同期 hits the same limit for that
minute. Remedy: rely on the branch / merge request link of the PBI (always
read completely), or add the link by naming the PBI in a later commit or the
MR title.

**Late-pushed commits (look-back).** GitLab filters commits by their commit
date, so a commit made days ago and pushed now lies in a window that was
already read. Once a day per repository a look-back pass re-reads the last
**14 days** of commits up to the commit cursor — one sprint, so a commit pushed
by the end of the sprint it was made in is still linked. Writes are idempotent,
so the re-read costs only the requests (typically 1–3 listings a day). Older
late pushes are not found automatically; use 過去分を再同期.

**Failures.** Each listing fails on its own: a failed request ends that
listing, what it read before is written, and its cursor moves only up to the
last page / window read completely. The other listings still run and save
their progress (e.g. a project with merge requests disabled — 403 on every
merge request request — still gets its commits and branches). Each failure is
logged once (`git sync listing failed` with the kind), and `lastError` lists
every failed listing, grouped by message (「マージリクエスト・コミット: …」); the
sync counts as failed (no `syncedAt`) and the next tick retries.

**Pipeline status** is looked up (one request each, at most 25 per sync) only
for merge requests past the cursor — not for those only re-read by the overlap
page.

**Deleted branches.** A branch that is no longer in GitLab's branch list keeps
its link, marked gone (`git_link.goneAt`): the PBI panel shows it as
削除済み, card badges and sprint suggestions ignore it, and it is live again if
the branch reappears. Only a complete branch list marks anything: when the
list is cut off (more than 300 "pbi" branches) nothing is marked and
`git sync truncated` { kind: "branch" } is logged (at most once a day per
repository and process).

### 過去分を再同期 (resync the last 90 days)

チーム設定 → Git 連携 → repository → 「過去分を再同期」 (PO / SM / admin,
`git.configure`; with confirmation; at most once per 10 min per repository).
The merge request cursor restarts 90 days back and a look-back pass over the
last 90 days of commits starts; new commits keep arriving meanwhile. One sync
runs at once, the rest within the normal per-sync limits over the next syncs,
so a busy repository takes some tens of minutes. Use it after the PBI key rules
changed (e.g. `PBI #43` titles from before they were recognised) or after a
long outage. The activity log records who started it (`git.resync`).
A resync bumps `git_repository.syncGeneration`; a sync that was already
running when it was pressed writes its status but not its cursors (log
`git sync cursors not saved: a resync started meanwhile`), so it cannot undo
the reset. The repository is checked to belong to the project before the
per-repository rate limit is claimed, and the check-and-claim is one step, so
two simultaneous presses start one resync (the other gets 429).

## Setting it up (PO / SM / admin)

1. In GitLab create an access token with scope **read_api** — a *group*
   access token (role Reporter) is best when the project has several
   repositories; a project access token works for one repository.
2. Kanflow → チーム設定 → Git 連携: switch on, paste the token, add each
   repository (display name + URL). 接続テスト checks the URL and token before saving.
3. Optionally enable マージで自動完了.

The token is sealed with AES-256-GCM (`lib/secret-box.ts`, key from
`INTEGRATION_SECRET_KEY` or derived from `AUTH_SECRET`) and never returned by
the API — the UI only shows its last four characters. Rotating
`AUTH_SECRET` / `INTEGRATION_SECRET_KEY` makes stored tokens unreadable;
repositories then show "トークンが読み取れません" until the token is re-entered.

## Repository as AI reference material (「AI の参照資料として使う」)

Instead of linking code to PBIs, a repository (e.g. a specification repository)
can be pulled into Kanflow so the project's AI chat answers questions from it
(read-only; nothing is ever written to GitLab).

**Visibility caveat.** Switching it on means **every member of the project can
see the repository's content through the AI — including people who have no
access to it in GitLab**. Only PO / SM / admin (`git.configure`) can switch it,
the switch asks for confirmation with exactly this warning, and the activity
log records who changed it. Do not switch on repositories whose content must
stay restricted to the GitLab project members.

| Step | What happens |
|---|---|
| チーム設定 → Git 連携 → repository → 「AI の参照資料として使う」 | Confirmation, then the first import starts in the background |
| 取り込むフォルダ（任意） | Comma / newline separated prefixes (`docs/, specs/`); empty = whole repository. Changing it re-imports (files now outside are removed) |
| Status line (settings and 開発（Git）) | 取り込み中… / 取り込み待ち / 「AI の参照資料: n ファイル・最終取り込み …」 / 取り込みエラー |
| 今すぐ取り込む | Any member (`git.sync`); runs in the background, at most once per 30 s per repository |
| Switch off | The imported passages are deleted at once; the AI can no longer read the repository |
| AI chat | A chip 「仕様書リポジトリを参照できます」; answers end with a 出典 list of `path（見出し）` links to GitLab at the indexed commit, or say 「仕様書（リポジトリ）には記載がありません」 |

**What is imported.** GitLab API only (no git binary): documents (md, txt, rst,
adoc, csv, tsv, json, yaml, toml, xml, html, sql …), Office / PDF (docx, xlsx,
pptx, pdf — text extracted in the same sandboxed worker as attachments, at most
60,000 characters per file) and common source code. Skipped automatically:
images and other binaries, `node_modules/`, `vendor/`, `dist/`, `build/`,
`.git/` and similar, lockfiles, minified bundles, files over 2 MB (text) /
20 MB (Office / PDF), and **secret files**: `.env*`, `*.pem`, `*.key`, `*.pfx`,
`*.p12`, `id_rsa*` / `id_ed25519*`, `.npmrc`, `.netrc`, credential / secret /
password config files, Terraform state. Inside imported files, private keys,
well-known token formats (GitLab, GitHub, AWS, Slack, JWT …), URL passwords and
`password=` / `token:` style values that look like real credentials are
replaced with `[REDACTED]`. Caps: 3,000 files, 300 passages per file, 30,000
per repository.

**How it stays current.** After each sync tick the poller checks every
knowledge repository with one request (newest commit of the default branch).
When it moved, only the files changed since the indexed commit are re-imported
(GitLab compare); the first import, a folder change, a compare that fails
(e.g. force push) or one touching ≥ 1,000 files re-reads the tree and downloads
only files whose blob id changed. One repository at a time per process, at most
90 s per tick (a manual run up to 10 min), 100 ms between downloads; an
unfinished import resumes after the last finished file on the next tick.
Measured on the trial specification repository (147 files, ~10 MB, 137
imported): first import 49 s / 2,305 passages; an incremental run with 54
changed files 17 s; an unchanged check 0.5 s.

**Search.** Passages are Markdown sections (with the heading path and GitLab
heading anchor) or ~2,000-character windows (line anchor for text / code) in
`repo_chunk`, searched with the FULLTEXT ngram index `ft_repo_chunk_text`
(falls back to LIKE like the other searches; `SEARCH_FULLTEXT=off` forces
LIKE). Japanese questions are split at particles; documents in English /
Japanese / Indonesian are matched as written (the tool tells the model to
retry with English terms when a Japanese search finds little).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `GIT_SYNC_INTERVAL_SEC` | 180 | Polling interval (min 60) |
| `GIT_SYNC` | on | `off` disables the background sync in this process |
| `GIT_SYNC_IN_DEV` | false | Run the poller under `next dev` |
| `GIT_ALLOWED_HOSTS` | the company GitLab | Hosts a repository URL may point at (SSRF guard) |
| `INTEGRATION_SECRET_KEY` | derived from `AUTH_SECRET` | Key for sealing tokens |

## Data

`git_integration` (one per project: source `provider`, switch, sealed token, option), `git_repository` (one row per
repository: URL, GitLab id, sync cursors, last error; AI knowledge switch, folder
filter, indexed commit / time / file count, in-progress cursor, index error),
`git_link` (one row per merge request / branch / commit × PBI; `goneAt` for
deleted branches), `repo_chunk`
(passages of AI knowledge repositories). Removing a repository removes its
links and passages; turning the integration off keeps everything (it just stops
syncing, hides the UI and the AI stops using the passages). Migrations
`20261012000000_git_integration`, `20261016000000_repo_knowledge`,
`20261030120000_git_sync_cursors` (per-listing cursors seeded from the old
`syncCursor`, `syncGeneration`, `git_link.goneAt`),
`20261030140000_git_integration_provider` (`git_integration.provider`, default
`gitlab`), `20261030160000_dev_work_claims` (`git_link.declaredById /
declaredAt`: merge requests linked by a developer through `dev:write` (`write:dev` in GitStation's plan documents), kept
current by the sync even when the MR does not name the PBI, display only — auto-complete,
release readiness and delivery insights read only links with `declaredAt IS NULL`;
when Git itself names the PBI the sync clears the marker — docs/api-v1.md "Development"). `syncCursor` is deprecated: still written
(the earlier of the two cursors) for one release so a rollback re-reads rather
than skips, then dropped.

## Troubleshooting

| Symptom | Check |
|---|---|
| "GitLab がトークンを拒否しました" | Token expired or lacks read_api / access to the repository |
| "リポジトリが見つからない" | URL typo, or the token's group does not contain the repository |
| Nothing linked | Branch / MR / commit really contains `PBI-<number>` of **this** project's PBI; wait one interval or press 今すぐ同期 |
| Old merge requests / commits not linked (e.g. after the key rules changed, or a commit pushed long after it was made) | 過去分を再同期 on the repository (last 90 days) |
| Log `git sync commit window skipped repeatedly` | More than 300 commits per minute for several minutes (imports, mass rebases); those commits are only partly linked — link by branch / merge request |
| No sync at all | Log line "git sync poller started" at start-up; `GIT_SYNC` not `off` |
| AI knowledge stays 取り込み待ち | The poller is off (`GIT_SYNC=off`, or `next dev` without `GIT_SYNC_IN_DEV=true`) — press 今すぐ取り込む |
| A document is missing from AI answers | It is outside the folder filter, over the size cap, a secret / binary file, or an Office file whose text could not be extracted (log line "repository indexed" shows processed / skipped counts) |
| "取り込み元「…」には対応していません" / log `git provider unsupported` | `git_integration.provider` is not `gitlab` (only GitLab is supported until GitStation, M3). Kanflow never stores another value, so the row was changed outside Kanflow. Without repositories: `PUT …/git` `{ "provider": "gitlab" }`; with repositories the one-source rule refuses the switch (409), so correct the row in the database (`UPDATE git_integration SET provider = 'gitlab' WHERE projectId = …`, with approval) |
| 「同期位置の記録を読み取れません」 | The stored sync position is corrupt: press 過去分を再同期 on the repository (it resets the position from scratch) |

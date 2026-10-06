# GitLab integration (Git 連携)

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
contains the PBI number — `PBI-123`, `pbi_123`, `PBI 123` or `PBI123` — is
linked to PBI #123 of that project. Suggested branch name: `feature/PBI-123-<title>`.
Several repositories per project are supported (front end, API, edge …); links
from all of them gather on the same PBI.

## How data arrives: polling

GitLab (`gitlab.scm.service.infosys.yamaha.com`) runs on Google Cloud and is
reached over the internet; it cannot call back into the LAN, so **webhooks are
not possible** (checked 2026-10-02: route PP-21 → ISP → Google, no private
link). Instead the web process polls:

- every `GIT_SYNC_INTERVAL_SEC` (default 180 s), each repository of an enabled
  project: merge requests and commits changed since the last sync (first sync:
  30 days back), plus the current branches containing "pbi";
- one tick at a time (no overlap), repositories one after another;
- 今すぐ同期 on the Git page / PBI panel syncs a project immediately (at most
  once per 20 s per project).

A failed sync keeps the watermark and stores a message on the repository
(shown in settings and on the Git page); the next tick retries.

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

`git_integration` (switch, sealed token, option), `git_repository` (one row per
repository: URL, GitLab id, watermark, last error; AI knowledge switch, folder
filter, indexed commit / time / file count, in-progress cursor, index error),
`git_link` (one row per merge request / branch / commit × PBI), `repo_chunk`
(passages of AI knowledge repositories). Removing a repository removes its
links and passages; turning the integration off keeps everything (it just stops
syncing, hides the UI and the AI stops using the passages). Migrations
`20261012000000_git_integration`, `20261016000000_repo_knowledge`.

## Troubleshooting

| Symptom | Check |
|---|---|
| "GitLab がトークンを拒否しました" | Token expired or lacks read_api / access to the repository |
| "リポジトリが見つからない" | URL typo, or the token's group does not contain the repository |
| Nothing linked | Branch / MR / commit really contains `PBI-<number>` of **this** project's PBI; wait one interval or press 今すぐ同期 |
| No sync at all | Log line "git sync poller started" at start-up; `GIT_SYNC` not `off` |
| AI knowledge stays 取り込み待ち | The poller is off (`GIT_SYNC=off`, or `next dev` without `GIT_SYNC_IN_DEV=true`) — press 今すぐ取り込む |
| A document is missing from AI answers | It is outside the folder filter, over the size cap, a secret / binary file, or an Office file whose text could not be extracted (log line "repository indexed" shows processed / skipped counts) |

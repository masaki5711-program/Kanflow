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
repository: URL, GitLab id, watermark, last error), `git_link` (one row per
merge request / branch / commit × PBI). Removing a repository removes its
links; turning the integration off keeps everything (it just stops syncing and
hides the UI). Migration `20261012000000_git_integration`.

## Troubleshooting

| Symptom | Check |
|---|---|
| "GitLab がトークンを拒否しました" | Token expired or lacks read_api / access to the repository |
| "リポジトリが見つからない" | URL typo, or the token's group does not contain the repository |
| Nothing linked | Branch / MR / commit really contains `PBI-<number>` of **this** project's PBI; wait one interval or press 今すぐ同期 |
| No sync at all | Log line "git sync poller started" at start-up; `GIT_SYNC` not `off` |

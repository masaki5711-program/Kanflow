-- N4 / N5 (docs/integration/gitstation-operations-plan.md §5.2, §5.3, §4): the PBI's 開発 panel and the card show
-- why an open GitStation merge request cannot merge yet (with the next step) and which other merge requests it is
-- predicted to conflict with. Read by the sync with the service account: GET …/merge-requests/{iid}/status and
-- …/conflicts.
--
-- git_link.mergeBlockers:      JSON array of { reason, detail } (detail = GitStation's text, data only); [] = none.
-- git_link.mergeable:          GitStation's `mergeable`.
-- git_link.mergeStatusAt:      when both were read; null = not read (GitLab, closed MRs, not read yet).
-- git_link.mergeStatusTriedAt: when the sync last tried (success or not): a failing MR waits its turn.
-- git_link.conflictPrediction: JSON { status, reason, stale, scannedAt, peers: [{ iid, draft, outcome, files,
--                              truncated }] } — the other MR's number and the count of files, never the paths.
-- All MR links only, all nullable: existing rows stay null until the sync reads them.
--
-- Lock impact: ADD COLUMN without a default is a catalogue change (no table rewrite). Append-only: never edit an
-- applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_link" ADD COLUMN     "conflictPrediction" JSONB,
ADD COLUMN     "mergeBlockers" JSONB,
ADD COLUMN     "mergeStatusAt" TIMESTAMP(3),
ADD COLUMN     "mergeStatusTriedAt" TIMESTAMP(3),
ADD COLUMN     "mergeable" BOOLEAN;

-- N11 マージの履歴 (docs/integration/gitstation-operations-plan.md §8.1): the project's Git page lists merged
-- merge requests (when, by whom, into which branch). Two facts the sync did not store:
--
-- git_link.targetBranch: the branch the merge request merges into (GitLab target_branch, GitStation target_branch).
-- git_link.mergedBy:     display name of who merged it (GitLab merge_user; GitStation: the actor of the
--                        merge_request.merged event). Null = unknown: links merged before this migration stay null
--                        until the source reports the merge request again, and GitStation names the merger only in
--                        the event, so its older merges stay unknown.
-- Index (projectId, mergedAt): the history reads a project's merged links, newest first.
--
-- Lock impact: ADD COLUMN without a default is a catalogue change (no table rewrite). CREATE INDEX takes a SHARE
-- lock on git_link (writes wait, reads continue) for the time of the build; the table holds one row per
-- (merge request / branch / commit, PBI) of the linked work only, so the build is short. Append-only: never edit
-- an applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_link" ADD COLUMN     "mergedBy" VARCHAR(191),
ADD COLUMN     "targetBranch" VARCHAR(255);

-- CreateIndex
CREATE INDEX "git_link_projectId_mergedAt_idx" ON "git_link"("projectId", "mergedAt");

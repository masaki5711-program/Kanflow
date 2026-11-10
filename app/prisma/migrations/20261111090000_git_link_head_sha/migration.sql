-- N2 (docs/integration/gitstation-operations-plan.md §5.2, §8): GitStation's check.completed names a commit only
-- (head_sha), never a merge request. To show a check's result on the merge request's card the sync must find the
-- merge request whose head that commit is.
--
-- git_link.headSha: MR links only — the commit at the head of the MR's source branch as last read (GitLab sha,
--                   GitStation head_sha; 40 or 64 lower-case hex). Null = not read yet: existing links stay null
--                   until the source reports the merge request again.
-- Index (repositoryId, headSha): the check lookup reads the links of one repository by head.
--
-- Lock impact: ADD COLUMN without a default is a catalogue change (no table rewrite). CREATE INDEX takes a SHARE
-- lock on git_link (writes wait, reads continue) for the time of the build; the table holds one row per
-- (merge request / branch / commit, PBI) of the linked work only, so the build is short. Append-only: never edit
-- an applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_link" ADD COLUMN     "headSha" VARCHAR(64);

-- CreateIndex
CREATE INDEX "git_link_repositoryId_headSha_idx" ON "git_link"("repositoryId", "headSha");

-- Git sync: one cursor per listing instead of one shared watermark, and
-- branch links that are marked gone instead of deleted
-- (docs/operations/git-integration.md "How data arrives").
--
--   * git_repository.mrCursorAt / mrCursorSeen
--       merge request cursor in GitLab time + tie-breaker (how many MRs with
--       exactly that updated_at were already read), so a backlog of MRs
--       changed in the same instant advances across syncs.
--   * git_repository.commitCursorAt / commitWindowSec / commitSkips
--       start and width of the next commit window, carried over between
--       syncs (shrinks when cut off, grows when not), and the number of
--       consecutive windows skipped at the smallest width (escalation).
--   * git_repository.lookbackCursorAt / lookbackWindowSec / lookbackAt
--       the daily look-back re-read of recent commits (late pushes) and the
--       person-started 「過去分を再同期」: position of a pass in progress and
--       when the last pass started.
--   * git_link.goneAt
--       a branch that left GitLab's (complete) branch list keeps its link,
--       marked gone, instead of the link being deleted.
--
-- Purely additive (nullable columns). syncCursor stays and is still written
-- for one release (rollback safety); its value seeds both new cursors below,
-- so the first sync after the upgrade continues where the old one stopped.
-- Rollback: ALTER TABLE `git_repository` DROP COLUMN `mrCursorAt`,
--   DROP COLUMN `mrCursorSeen`, DROP COLUMN `commitCursorAt`,
--   DROP COLUMN `commitWindowSec`, DROP COLUMN `commitSkips`,
--   DROP COLUMN `lookbackCursorAt`, DROP COLUMN `lookbackWindowSec`,
--   DROP COLUMN `lookbackAt`; ALTER TABLE `git_link` DROP COLUMN `goneAt`.
-- (Branch links marked gone then reappear as live links until the old code
-- prunes them again on its next sync.)

-- AlterTable
ALTER TABLE `git_repository` ADD COLUMN `mrCursorAt` DATETIME(3) NULL,
    ADD COLUMN `mrCursorSeen` INTEGER NULL,
    ADD COLUMN `commitCursorAt` DATETIME(3) NULL,
    ADD COLUMN `commitWindowSec` INTEGER NULL,
    ADD COLUMN `commitSkips` INTEGER NULL,
    ADD COLUMN `lookbackCursorAt` DATETIME(3) NULL,
    ADD COLUMN `lookbackWindowSec` INTEGER NULL,
    ADD COLUMN `lookbackAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `git_link` ADD COLUMN `goneAt` DATETIME(3) NULL;

-- Seed the per-kind cursors from the old shared watermark.
UPDATE `git_repository`
SET `mrCursorAt` = `syncCursor`, `mrCursorSeen` = 0, `commitCursorAt` = `syncCursor`
WHERE `syncCursor` IS NOT NULL AND `mrCursorAt` IS NULL;

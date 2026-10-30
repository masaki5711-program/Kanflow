-- Git integration: the project's one ingestion source (K4, DevSource layer;
-- docs/operations/git-integration.md "Source (provider)").
--
--   * git_integration.provider
--       where the project's merge requests / commits / branches / pipelines are
--       read from. Only 'gitlab' is accepted today (validated in
--       services/git/git-provider by the settings API and the source factory);
--       'gitstation' joins with its source (M3). One integration row per
--       project (primary key projectId), so a project never reads two sources.
--
-- Purely additive: existing rows become 'gitlab', which is what they read.
-- Rollback: ALTER TABLE `git_integration` DROP COLUMN `provider`;

-- AlterTable
ALTER TABLE `git_integration` ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'gitlab';

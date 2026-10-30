-- Work claims (K5 review): why and by whom a claim ended.
--
--   * work_claim.releaseReason  'released' (owner) | 'takeover' (the owner's other
--                               session) | 'stale' (superseded by a new claim after the
--                               stale window) | 'moderator' (PO / SM / admin); NULL = open.
--   * work_claim.releasedById   who ended it when not the owner (no foreign key: history
--                               must survive a deleted user; the id is only informative).
--
-- Purely additive (nullable columns on a table added by 20261030160000).
-- Rollback: ALTER TABLE `work_claim` DROP COLUMN `releaseReason`, DROP COLUMN `releasedById`;

-- AlterTable
ALTER TABLE `work_claim` ADD COLUMN `releaseReason` VARCHAR(16) NULL,
    ADD COLUMN `releasedById` VARCHAR(191) NULL;


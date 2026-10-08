-- 改善成果ボード: money effect in US dollars + space reduction in m².
--
--   * annualEffectUsd  効果金額 in whole US dollars per year (replaces the yen field).
--   * spaceSavedM2     スペース削減 in square metres. Area only for now; a money
--                      conversion (m² unit price) is planned and will read this column.
--
-- The old annualEffectYen column is KEPT (nothing is converted or deleted): it is
-- no longer shown or written, and the dollar value is entered afresh.
--
-- Additive only (two nullable columns) - no locks beyond a metadata change, no
-- data touched.
--
-- Rollback: ALTER TABLE `ReleaseBacklogItem` DROP COLUMN `annualEffectUsd`,
-- DROP COLUMN `spaceSavedM2`;

-- AlterTable
ALTER TABLE `ReleaseBacklogItem` ADD COLUMN `annualEffectUsd` INTEGER NULL,
    ADD COLUMN `spaceSavedM2` DOUBLE NULL;

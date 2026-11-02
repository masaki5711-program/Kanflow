-- AlterTable
ALTER TABLE `Sprint`
  ADD COLUMN `retrospectiveKeep` TEXT NULL,
  ADD COLUMN `retrospectiveProblem` TEXT NULL,
  ADD COLUMN `retrospectiveTry` TEXT NULL;

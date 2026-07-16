-- Change default of Project.pointUnit from 人日 to SP (Story Points).
-- Existing projects keep their current value.
ALTER TABLE `Project` MODIFY COLUMN `pointUnit` VARCHAR(191) NOT NULL DEFAULT 'SP';

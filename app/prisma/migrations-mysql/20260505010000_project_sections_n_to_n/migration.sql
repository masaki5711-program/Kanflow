-- CreateTable: ProjectSection (N:N junction)
CREATE TABLE `ProjectSection` (
  `projectId` VARCHAR(191) NOT NULL,
  `sectionId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ProjectSection_projectId_idx`(`projectId`),
  INDEX `ProjectSection_sectionId_idx`(`sectionId`),
  PRIMARY KEY (`projectId`, `sectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate existing single-section assignments into the junction table.
INSERT INTO `ProjectSection` (`projectId`, `sectionId`, `assignedAt`)
SELECT `id`, `sectionId`, NOW(3)
FROM `Project`
WHERE `sectionId` IS NOT NULL;

-- Drop the old single-section column on Project.
ALTER TABLE `Project` DROP FOREIGN KEY `Project_sectionId_fkey`;
ALTER TABLE `Project` DROP INDEX `Project_sectionId_idx`;
ALTER TABLE `Project` DROP COLUMN `sectionId`;

-- Add FKs on the junction table.
ALTER TABLE `ProjectSection` ADD CONSTRAINT `ProjectSection_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProjectSection` ADD CONSTRAINT `ProjectSection_sectionId_fkey`
  FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

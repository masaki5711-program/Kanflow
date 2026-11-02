-- CreateTable: UserFixedTaskItem — child sub-tasks belonging to a
-- UserFixedTask "group". When a user picks a group from the dropdown in
-- the sprint task form, every item gets bulk-inserted as a separate
-- SprintBacklogItem under the selected PBI.
CREATE TABLE `UserFixedTaskItem` (
  `id`        VARCHAR(191) NOT NULL,
  `groupId`   VARCHAR(191) NOT NULL,
  `taskName`  VARCHAR(191) NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `UserFixedTaskItem_groupId_idx`(`groupId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserFixedTaskItem` ADD CONSTRAINT `UserFixedTaskItem_groupId_fkey`
  FOREIGN KEY (`groupId`) REFERENCES `UserFixedTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

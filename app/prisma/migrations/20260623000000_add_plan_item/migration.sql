-- CreateTable: PlanItem — the project's master plan ("全体計画").
-- Independent of sprints and PBIs. Supports unlimited nesting via parentId.
CREATE TABLE `PlanItem` (
  `id`            VARCHAR(191) NOT NULL,
  `projectId`     VARCHAR(191) NOT NULL,
  `parentId`      VARCHAR(191) NULL,
  `name`          VARCHAR(255) NOT NULL,
  `description`   TEXT NULL,
  `plannedStart`  DATETIME(3) NOT NULL,
  `plannedEnd`    DATETIME(3) NOT NULL,
  `actualStart`   DATETIME(3) NULL,
  `actualEnd`     DATETIME(3) NULL,
  `progressPct`   INT NOT NULL DEFAULT 0,
  `color`         VARCHAR(32) NULL,
  `status`        VARCHAR(191) NOT NULL DEFAULT 'not_started',
  `sortOrder`     INT NOT NULL DEFAULT 0,
  `isMilestone`   TINYINT(1) NOT NULL DEFAULT 0,
  `notes`         TEXT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,
  INDEX `PlanItem_projectId_idx`(`projectId`),
  INDEX `PlanItem_parentId_idx`(`parentId`),
  INDEX `PlanItem_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PlanItem` ADD CONSTRAINT `PlanItem_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PlanItem` ADD CONSTRAINT `PlanItem_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `PlanItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

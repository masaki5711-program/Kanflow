-- CreateTable: AiReport — autonomous AI investigation reports.
-- Written by the surveillance job (schedule/threshold trigger) and the
-- sprint-completion event trigger; displayed on the project dashboard.
-- New empty table: non-destructive, no existing data touched.
CREATE TABLE `AiReport` (
  `id`        VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `trigger`   VARCHAR(191) NOT NULL,
  `status`    VARCHAR(191) NOT NULL DEFAULT 'done',
  `title`     VARCHAR(191) NOT NULL,
  `summary`   TEXT NULL,
  `body`      TEXT NULL,
  `meta`      TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AiReport_projectId_createdAt_idx`(`projectId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AiReport` ADD CONSTRAINT `AiReport_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

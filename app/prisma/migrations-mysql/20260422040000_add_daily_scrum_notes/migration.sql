-- CreateTable
CREATE TABLE `DailyScrumNote` (
  `id` VARCHAR(191) NOT NULL,
  `sprintId` VARCHAR(191) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `content` TEXT NOT NULL,
  `author` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);

-- CreateIndex
CREATE INDEX `DailyScrumNote_sprintId_idx` ON `DailyScrumNote`(`sprintId`);

-- CreateIndex
CREATE INDEX `DailyScrumNote_sprintId_date_idx` ON `DailyScrumNote`(`sprintId`, `date`);

-- AddForeignKey
ALTER TABLE `DailyScrumNote`
  ADD CONSTRAINT `DailyScrumNote_sprintId_fkey`
  FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

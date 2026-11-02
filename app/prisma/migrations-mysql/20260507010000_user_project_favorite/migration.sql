-- CreateTable: UserProjectFavorite — per-user starred projects.
CREATE TABLE `UserProjectFavorite` (
  `userId`    VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `UserProjectFavorite_userId_idx`(`userId`),
  INDEX `UserProjectFavorite_projectId_idx`(`projectId`),
  PRIMARY KEY (`userId`, `projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserProjectFavorite` ADD CONSTRAINT `UserProjectFavorite_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserProjectFavorite` ADD CONSTRAINT `UserProjectFavorite_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

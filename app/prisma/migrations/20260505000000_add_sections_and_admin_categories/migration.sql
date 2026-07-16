-- CreateTable: Section
CREATE TABLE `Section` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Section_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: UserSection (junction for N:N)
CREATE TABLE `UserSection` (
  `userId` VARCHAR(191) NOT NULL,
  `sectionId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `UserSection_userId_idx`(`userId`),
  INDEX `UserSection_sectionId_idx`(`sectionId`),
  PRIMARY KEY (`userId`, `sectionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: AdminCategory
CREATE TABLE `AdminCategory` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `color` VARCHAR(191) NOT NULL DEFAULT 'gray',
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `sectionId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AdminCategory_sectionId_name_key`(`sectionId`, `name`),
  INDEX `AdminCategory_sectionId_idx`(`sectionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: AdminCategoryAssignment
CREATE TABLE `AdminCategoryAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `AdminCategoryAssignment_categoryId_projectId_key`(`categoryId`, `projectId`),
  INDEX `AdminCategoryAssignment_categoryId_idx`(`categoryId`),
  INDEX `AdminCategoryAssignment_projectId_idx`(`projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: Project — add sectionId
ALTER TABLE `Project` ADD COLUMN `sectionId` VARCHAR(191) NULL;
CREATE INDEX `Project_sectionId_idx` ON `Project`(`sectionId`);

-- AddForeignKeys
ALTER TABLE `UserSection` ADD CONSTRAINT `UserSection_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserSection` ADD CONSTRAINT `UserSection_sectionId_fkey`
  FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Project` ADD CONSTRAINT `Project_sectionId_fkey`
  FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AdminCategory` ADD CONSTRAINT `AdminCategory_sectionId_fkey`
  FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AdminCategoryAssignment` ADD CONSTRAINT `AdminCategoryAssignment_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `AdminCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AdminCategoryAssignment` ADD CONSTRAINT `AdminCategoryAssignment_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

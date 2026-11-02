-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `employeeNumber` VARCHAR(191) NULL,
  ADD COLUMN `department` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_employeeNumber_key` ON `User`(`employeeNumber`);

-- CreateIndex
CREATE INDEX `User_department_idx` ON `User`(`department`);

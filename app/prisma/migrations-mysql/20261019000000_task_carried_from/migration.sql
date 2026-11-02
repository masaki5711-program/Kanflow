-- Carry-over of unfinished sprint tasks into the next sprint.
--
-- `carriedFromId` points a copied task at the task it was copied from, so the
-- original (left in the earlier sprint as its record) can be recognised as taken
-- over: it no longer holds its PBI back from completing and is not offered for
-- carry-over a second time. Deleting the copy clears the link (SET NULL), which
-- makes the original count as unfinished again.
--
-- Purely additive: one nullable column, one index, one foreign key.
--
-- Rollback: ALTER TABLE `SprintBacklogItem` DROP FOREIGN KEY `SprintBacklogItem_carriedFromId_fkey`,
--           DROP INDEX `SprintBacklogItem_carriedFromId_idx`, DROP COLUMN `carriedFromId`;

-- AlterTable
ALTER TABLE `SprintBacklogItem` ADD COLUMN `carriedFromId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `SprintBacklogItem_carriedFromId_idx` ON `SprintBacklogItem`(`carriedFromId`);

-- AddForeignKey
ALTER TABLE `SprintBacklogItem` ADD CONSTRAINT `SprintBacklogItem_carriedFromId_fkey` FOREIGN KEY (`carriedFromId`) REFERENCES `SprintBacklogItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

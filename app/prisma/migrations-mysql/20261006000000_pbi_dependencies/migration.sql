-- PBI dependencies: finish-to-start links between product backlog items of
-- one project ("#12 must be completed before #15 can start").
--
-- Adds:
--   * BacklogItemDependency  predecessorId → successorId (both FK
--     ProductBacklogItem ON DELETE CASCADE, so a purged PBI drops its links;
--     a trashed PBI keeps them for a restore), UNIQUE(predecessorId, successorId).
--
-- Purely additive: one new table, no existing table or row is touched.
-- utf8mb4 / utf8mb4_unicode_ci and VARCHAR(191) ids like ProductBacklogItem.id.
--
-- Generated with
--   prisma migrate diff --from-schema <pre-change schema> --to-schema prisma/schema.prisma --script
-- (schema-to-schema, no database access) and reviewed by hand.
--
-- Rollback (the links are lost): remove the table BacklogItemDependency.

-- CreateTable
CREATE TABLE `BacklogItemDependency` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `predecessorId` VARCHAR(191) NOT NULL,
    `successorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BacklogItemDependency_successorId_idx`(`successorId`),
    INDEX `BacklogItemDependency_projectId_idx`(`projectId`),
    UNIQUE INDEX `BacklogItemDependency_predecessorId_successorId_key`(`predecessorId`, `successorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BacklogItemDependency` ADD CONSTRAINT `BacklogItemDependency_predecessorId_fkey` FOREIGN KEY (`predecessorId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BacklogItemDependency` ADD CONSTRAINT `BacklogItemDependency_successorId_fkey` FOREIGN KEY (`successorId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


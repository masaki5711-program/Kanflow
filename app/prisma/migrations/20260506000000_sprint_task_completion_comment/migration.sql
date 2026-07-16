-- AlterTable: SprintBacklogItem — add completionComment for the
-- "what was done" note recorded when a task is marked done.
ALTER TABLE `SprintBacklogItem` ADD COLUMN `completionComment` TEXT NULL;

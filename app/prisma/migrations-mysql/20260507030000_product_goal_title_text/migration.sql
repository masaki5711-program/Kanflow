-- AlterTable: ProductGoal — promote title from VARCHAR(191) to TEXT so users
-- can enter long, multi-line product goals without a character limit.
ALTER TABLE `ProductGoal` MODIFY `title` TEXT NOT NULL;

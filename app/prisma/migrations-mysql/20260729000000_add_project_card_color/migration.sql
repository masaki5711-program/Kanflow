-- Add Project.cardColor — card tint on the project list, set from the new
-- per-card options (⋮) menu. Null = default white card.
-- Non-destructive: one nullable column, no existing data touched.
ALTER TABLE `Project` ADD COLUMN `cardColor` VARCHAR(191) NULL;

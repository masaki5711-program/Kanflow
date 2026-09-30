-- Add Project.bilingualMode — team option that auto-annotates all saved
-- free-text input with a Japanese/Indonesian bilingual rendering.
-- Non-destructive: one column with a default, no existing data touched.
ALTER TABLE `Project` ADD COLUMN `bilingualMode` BOOLEAN NOT NULL DEFAULT false;

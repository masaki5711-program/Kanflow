-- Rename Project.sprintDurationWeeks → sprintDurationDays and convert the
-- stored values from weeks to days (×7) so existing projects keep their
-- effective sprint length while the new finer-grained options (1–4 days,
-- 1–4 weeks) become selectable in the UI.

ALTER TABLE `Project`
  CHANGE COLUMN `sprintDurationWeeks` `sprintDurationDays` INT NOT NULL DEFAULT 7;

UPDATE `Project` SET `sprintDurationDays` = `sprintDurationDays` * 7;

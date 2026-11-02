-- English as a third stored language for user-entered text.
--
-- Adds field_translation.text_en TEXT NULL (nullable, no default: INSTANT).
-- The FULLTEXT index ft_translation_text (text_ja, text_id) is unchanged.
--
-- No data change: rows translated before this release keep status 'done' and
-- get their English side from the worker, one at a time and only inside the
-- quiet window TRANSLATION_EN_BACKFILL_HOURS (default 19-7, see
-- src/lib/translation/backfill-window.ts), so the shared Ollama never sees a
-- burst. New and edited text is translated into all three languages at once.
--
-- Rollback: remove the column text_en.

-- AlterTable
ALTER TABLE `field_translation` ADD COLUMN `text_en` TEXT NULL;

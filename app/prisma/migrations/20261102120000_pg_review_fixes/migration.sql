-- Review follow-ups of the PostgreSQL move (MR K1). Hand-written: Prisma's
-- generated version would DROP and re-ADD the columns (data loss).
--
-- 1. Case-insensitive unique keys, as under MySQL utf8mb4_unicode_ci:
--    milestone_checklist_state(planItemId, label) and git_release(repositoryId, tag).
--    ALTER COLUMN ... TYPE keeps the rows; PostgreSQL rebuilds the unique indexes.
--    The former VARCHAR(255) bound is kept as a CHECK (citext has no length).
--    Deliberately NOT changed: lesson(signature, scope) - signature is a lowercase
--    hex digest and scope embeds case-sensitive cuids ("project:<id>"), so exact
--    comparison is the correct semantics; reactions (emoji), notification
--    dedupe keys and api token hashes are machine values too.
ALTER TABLE "milestone_checklist_state" ALTER COLUMN "label" TYPE CITEXT;
ALTER TABLE "milestone_checklist_state" ADD CONSTRAINT "milestone_checklist_state_label_len" CHECK (char_length("label") <= 255);
ALTER TABLE "git_release" ALTER COLUMN "tag" TYPE CITEXT;
ALTER TABLE "git_release" ADD CONSTRAINT "git_release_tag_len" CHECK (char_length("tag") <= 255);

-- 2. Partial index for the English-backfill claim of the translation worker
--    (lib/translation/worker.ts claimEnglishBackfill: status = 'done' AND
--    text_en IS NULL AND source_locale IN ('ja','id') ORDER BY priority DESC,
--    updated_at DESC ... FOR UPDATE SKIP LOCKED). Only rows still waiting for
--    their English side are indexed, so it stays small. schema.prisma declares
--    the same index (previewFeatures "partialIndexes", predicate in PostgreSQL's
--    normalized form) so the drift check stays clean.
CREATE INDEX "field_translation_en_backfill_idx" ON "field_translation" ("priority" DESC, "updated_at" DESC)
  WHERE "status" = 'done' AND "text_en" IS NULL AND "source_locale" IN ('ja', 'id');

-- P3 FULLTEXT search (docs/roadmap.md, phase P3).
--
-- Adds FULLTEXT indexes WITH PARSER ngram on the text columns searched by the
-- global search (services/search) and the chat tool search_work_items
-- (lib/analysis-tools-search.ts). The MATCH(...) column lists in
-- services/search/search.fulltext.ts must stay identical to these indexes.
--
--   ft_pbi_text          ProductBacklogItem(initiative, epic, userStory, acceptanceCriteria)
--   ft_task_name         SprintBacklogItem(taskName)
--   ft_icebox_text       IceboxItem(request, background, pbEpic)
--   ft_project_name      Project(name)
--   ft_goal_text         ProductGoal(title, description)
--   ft_translation_text  field_translation(text_ja, text_id)   -- JA <-> ID matches
--   ft_comment_body      Comment(body)                          -- for a later comment search
--
-- All columns are VARCHAR(191) / TEXT, utf8mb4_unicode_ci (checked read-only
-- on the production server 2026-09-30).
--
-- ngram parser
--   Text is indexed as overlapping n-grams of ngram_token_size characters
--   (server value 2 = the default; read-only, changing it needs a MySQL
--   restart AND a rebuild of these indexes). A BOOLEAN MODE term longer than
--   the token size becomes a phrase search of its bigrams, i.e. substring
--   semantics for Japanese and Latin text alike. 1-character terms cannot be
--   matched reliably: the app keeps LIKE for them (lib/fulltext). The
--   innodb_ft_min_token_size / stopword *length* settings do not apply to ngram.
--
-- Stopwords (IMPORTANT)
--   The ngram parser drops every n-gram that CONTAINS a stopword, and the
--   built-in InnoDB list contains the single letters "a" and "i" — with it,
--   every bigram containing a / i (most Indonesian and English text) would be
--   missing from the index. The stopword setting is bound to an index when it
--   is created, so this script disables it for its own session first.
--   Any later statement that REBUILDS one of these tables (ALTER TABLE ...
--   FORCE / COPY, OPTIMIZE TABLE with innodb_optimize_fulltext_only=OFF) should
--   run with the same SET SESSION to be safe.
--
-- Locking / duration
--   The first FULLTEXT index of an InnoDB table adds the hidden FTS_DOC_ID
--   column, i.e. a table rebuild (ALGORITHM=INPLACE, but concurrent DML is NOT
--   permitted: reads work, writes to that table wait). LOCK=SHARED is stated
--   explicitly so MySQL errors instead of silently falling back to a COPY.
--   One FULLTEXT index per statement (InnoDB cannot build several in one
--   INPLACE ALTER). Table sizes on 2026-09-30: field_translation ~1.6k rows /
--   1.5 MB, every other table < 400 rows — each statement takes well under a
--   second; run it in the normal maintenance window of docs/operations/deploy.md.
--
-- Rollback (indexes only, no data change):
--   DROP INDEX `ft_pbi_text` ON `ProductBacklogItem`;  DROP INDEX `ft_task_name` ON `SprintBacklogItem`;
--   DROP INDEX `ft_icebox_text` ON `IceboxItem`;      DROP INDEX `ft_project_name` ON `Project`;
--   DROP INDEX `ft_goal_text` ON `ProductGoal`;        DROP INDEX `ft_translation_text` ON `field_translation`;
--   DROP INDEX `ft_comment_body` ON `Comment`;
--   (or set SEARCH_FULLTEXT=off; with the indexes missing the app also falls
--   back to LIKE automatically on MySQL error 1191.)
--
-- Prisma: schema.prisma carries matching `@@fulltext([...], map: "ft_...")`
-- attributes (GA for MySQL, no preview flag). Prisma does not model the
-- parser, so `prisma migrate diff --from-config-datasource --to-schema` (the
-- deploy drift check) reports no difference once this is applied; the
-- Prisma-generated equivalent would lack WITH PARSER ngram, hence hand-written.
--
-- Requires 20261002000000_p2_collab_foundation (Comment table, deletedAt columns).

SET SESSION innodb_ft_enable_stopword = OFF;

CREATE FULLTEXT INDEX `ft_pbi_text` ON `ProductBacklogItem`(`initiative`, `epic`, `userStory`, `acceptanceCriteria`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

CREATE FULLTEXT INDEX `ft_task_name` ON `SprintBacklogItem`(`taskName`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

CREATE FULLTEXT INDEX `ft_icebox_text` ON `IceboxItem`(`request`, `background`, `pbEpic`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

CREATE FULLTEXT INDEX `ft_project_name` ON `Project`(`name`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

CREATE FULLTEXT INDEX `ft_goal_text` ON `ProductGoal`(`title`, `description`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

CREATE FULLTEXT INDEX `ft_translation_text` ON `field_translation`(`text_ja`, `text_id`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

CREATE FULLTEXT INDEX `ft_comment_body` ON `Comment`(`body`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

SET SESSION innodb_ft_enable_stopword = ON;

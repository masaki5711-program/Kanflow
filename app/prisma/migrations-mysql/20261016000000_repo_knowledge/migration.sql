-- Repository knowledge base for the AI chat ("AI の参照資料として使う").
--
-- Adds:
--   * git_repository  aiKnowledge switch (default off), optional folder filter,
--                     index state (indexed commit / time / file count), the
--                     in-progress pass (target commit + cursor, resumed on the
--                     next poller tick) and the last index error.
--   * repo_chunk      searchable passages of the indexed files (Markdown
--                     sections / ~2,000-character windows) with the heading
--                     path and GitLab anchor used for citations.
--   * ft_repo_chunk_text  FULLTEXT ngram index on repo_chunk(path, heading,
--                     content) — the MATCH column list in
--                     services/git/repo-search.ts must stay identical.
--
-- Purely additive: new columns have defaults / are nullable, repo_chunk is new
-- and empty. Nothing is indexed until a PO / SM switches a repository on.
--
-- FULLTEXT index: hand-written exactly like 20261003010000_fulltext_search
-- (see the notes there): Prisma cannot express WITH PARSER ngram, and the
-- stopword list is disabled for this session so bigrams containing "a" / "i"
-- (English / Indonesian text) are not dropped from the index. The table is
-- empty when the index is built, so the statement is instant.
-- schema.prisma carries the matching @@fulltext(map: "ft_repo_chunk_text").
--
-- Rollback: DROP TABLE `repo_chunk`; then
--   ALTER TABLE `git_repository` DROP COLUMN `aiKnowledge`, DROP COLUMN `aiPathFilter`,
--     DROP COLUMN `indexedSha`, DROP COLUMN `indexedAt`, DROP COLUMN `indexedFiles`,
--     DROP COLUMN `indexTargetSha`, DROP COLUMN `indexCursor`, DROP COLUMN `indexError`,
--     DROP COLUMN `indexErrorAt`;
-- Generated with prisma migrate diff (datasource-to-schema) and edited by hand
-- for the FULLTEXT index.
--
-- Requires 20261012000000_git_integration.

-- AlterTable
ALTER TABLE `git_repository` ADD COLUMN `aiKnowledge` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `aiPathFilter` VARCHAR(1000) NULL,
    ADD COLUMN `indexCursor` VARCHAR(512) NULL,
    ADD COLUMN `indexError` VARCHAR(500) NULL,
    ADD COLUMN `indexErrorAt` DATETIME(3) NULL,
    ADD COLUMN `indexTargetSha` VARCHAR(64) NULL,
    ADD COLUMN `indexedAt` DATETIME(3) NULL,
    ADD COLUMN `indexedFiles` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `indexedSha` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `repo_chunk` (
    `id` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `heading` VARCHAR(500) NULL,
    `anchor` VARCHAR(255) NULL,
    `chunkNo` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `blobSha` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `repo_chunk_repositoryId_path_chunkNo_idx`(`repositoryId`, `path`, `chunkNo`),
    INDEX `repo_chunk_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `repo_chunk` ADD CONSTRAINT `repo_chunk_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `git_repository`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repo_chunk` ADD CONSTRAINT `repo_chunk_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

SET SESSION innodb_ft_enable_stopword = OFF;

CREATE FULLTEXT INDEX `ft_repo_chunk_text` ON `repo_chunk`(`path`, `heading`, `content`) WITH PARSER ngram ALGORITHM=INPLACE LOCK=SHARED;

SET SESSION innodb_ft_enable_stopword = ON;

-- PBI confidential flag (decision D-5; docs/api-v1.md, docs/mcp.md):
--
--   * ProductBacklogItem.confidential   a confidential PBI is never returned to the Claude-facing
--                                       MCP or the /api/v1 dev API (reads omit it, a direct get
--                                       answers 404, writes that name it answer 404). The signed-in
--                                       web UI still shows it. Same idea as lesson.confidential (W11).
--
-- Purely additive: one NOT NULL column with a constant default (existing PBIs become false).
-- Portable to PostgreSQL as is (BOOLEAN NOT NULL DEFAULT false).
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
-- Rollback:
--   ALTER TABLE `ProductBacklogItem` DROP COLUMN `confidential`;

-- AlterTable
ALTER TABLE `ProductBacklogItem` ADD COLUMN `confidential` BOOLEAN NOT NULL DEFAULT false;

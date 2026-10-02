-- Dashboard attachments can be links (e.g. a GitLab repository URL with a
-- display name such as group/repo) next to uploaded files.
--
-- Adds ProjectAttachment.linkUrl VARCHAR(2048) NULL. A link row has no stored
-- file (fileName '', fileSize 0, mimeType 'text/x-uri'); only http(s) URLs are
-- accepted by the API. Nullable column without default: ALGORITHM=INSTANT.
--
-- Purely additive; existing rows are untouched (linkUrl NULL = uploaded file).
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
--
-- Rollback (link entries lose their URL): remove the column linkUrl.

-- AlterTable
ALTER TABLE `ProjectAttachment` ADD COLUMN `linkUrl` VARCHAR(2048) NULL;


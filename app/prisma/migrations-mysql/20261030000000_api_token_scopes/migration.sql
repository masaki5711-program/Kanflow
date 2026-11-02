-- Fine-grained token scopes + per-token project restriction (Kanflow MCP,
-- docs/api-v1.md).
--
--   * ApiToken.projectIds  JSON array of the project ids the token may use;
--                          NULL = every project the owner can access.
--
-- Scopes stay in the existing ApiToken.scopes column (JSON array): the new
-- write scopes are new values, no column change. Existing tokens keep
-- ["read"] and NULL here, so they behave exactly as before.
--
-- Purely additive (one nullable column). Rollback: ALTER TABLE `ApiToken`
-- DROP COLUMN `projectIds`.

-- AlterTable
ALTER TABLE `ApiToken` ADD COLUMN `projectIds` TEXT NULL;

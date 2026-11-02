-- Rehearsal container only (synthetic credentials). The read-only account the
-- migrator uses - the same GRANT the cutover runbook recommends for production:
--   SELECT on the application schema, nothing else (no LOCK TABLES, no RELOAD:
--   the consistent snapshot comes from START TRANSACTION WITH CONSISTENT SNAPSHOT).
CREATE USER IF NOT EXISTS 'k2_reader'@'%' IDENTIFIED BY 'k2_reader_synthetic';
GRANT SELECT ON scrum_tool.* TO 'k2_reader'@'%';
-- The second rehearsal database used by the integration tests.
CREATE DATABASE IF NOT EXISTS scrum_tool_it CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON scrum_tool_it.* TO 'k2_app'@'%';
GRANT SELECT ON scrum_tool_it.* TO 'k2_reader'@'%';
GRANT ALL PRIVILEGES ON scrum_tool.* TO 'k2_app'@'%';

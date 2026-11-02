-- Rehearsal container only (synthetic credentials). Database names end in
-- _synthetic: the seed script refuses any other name (the production database
-- is scrum_tool). The read-only account the migrator uses has the same GRANT the
-- cutover runbook recommends for production:
--   SELECT on the application schema, nothing else (no LOCK TABLES, no RELOAD:
--   the consistent snapshot comes from START TRANSACTION WITH CONSISTENT SNAPSHOT).
CREATE USER IF NOT EXISTS 'k2_reader'@'%' IDENTIFIED BY 'k2_reader_synthetic';
GRANT SELECT ON scrum_tool_synthetic.* TO 'k2_reader'@'%';
GRANT ALL PRIVILEGES ON scrum_tool_synthetic.* TO 'k2_app'@'%';
-- The database of the integration tests.
CREATE DATABASE IF NOT EXISTS scrum_tool_it_synthetic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON scrum_tool_it_synthetic.* TO 'k2_app'@'%';
GRANT SELECT ON scrum_tool_it_synthetic.* TO 'k2_reader'@'%';
-- The scale rehearsal.
CREATE DATABASE IF NOT EXISTS scrum_tool_scale_synthetic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON scrum_tool_scale_synthetic.* TO 'k2_app'@'%';
GRANT SELECT ON scrum_tool_scale_synthetic.* TO 'k2_reader'@'%';

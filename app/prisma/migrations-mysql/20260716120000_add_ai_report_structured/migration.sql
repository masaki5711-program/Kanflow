-- Add AiReport.structured — JSON payload submitted by the agent through the
-- submit_report tool (structured report: headline / findings / metrics /
-- causes / actions). Nullable: legacy rows and plain-text reports keep NULL
-- and the dashboard falls back to rendering the markdown body.
-- Non-destructive: adds one nullable column, no existing data touched.
ALTER TABLE `AiReport` ADD COLUMN `structured` TEXT NULL;

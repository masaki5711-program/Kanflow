-- Unique (projectId, displayId) for ProductBacklogItem and IceboxItem.
--
-- displayId was assigned as max + 1 without a constraint, so two concurrent
-- creates could produce the same number. The app now retries on P2002.
--
-- Pre-check (read-only; run before deploying to see what will be renumbered):
--
--   SELECT 'ProductBacklogItem' AS tbl, projectId, displayId, COUNT(*) AS n
--     FROM `ProductBacklogItem` GROUP BY projectId, displayId HAVING n > 1
--   UNION ALL
--   SELECT 'IceboxItem', projectId, displayId, COUNT(*)
--     FROM `IceboxItem` GROUP BY projectId, displayId HAVING COUNT(*) > 1;
--
-- If duplicates exist they are renumbered deterministically so the index
-- creation cannot fail: in each (projectId, displayId) group the oldest row
-- (createdAt, then id) keeps its number; every later row gets
-- max(displayId of the project) + n, n = 1, 2, ... ordered by
-- (displayId, createdAt, id). With no duplicates the UPDATEs touch nothing.

-- Renumber duplicate PBIs
UPDATE `ProductBacklogItem` AS t
JOIN (
    SELECT d.`id`,
           m.`maxDisplayId` + ROW_NUMBER() OVER (
               PARTITION BY d.`projectId` ORDER BY d.`displayId`, d.`createdAt`, d.`id`
           ) AS `newDisplayId`
      FROM (
          SELECT `id`, `projectId`, `displayId`, `createdAt`,
                 ROW_NUMBER() OVER (
                     PARTITION BY `projectId`, `displayId` ORDER BY `createdAt`, `id`
                 ) AS `rn`
            FROM `ProductBacklogItem`
      ) AS d
      JOIN (
          SELECT `projectId`, MAX(`displayId`) AS `maxDisplayId`
            FROM `ProductBacklogItem`
           GROUP BY `projectId`
      ) AS m ON m.`projectId` = d.`projectId`
     WHERE d.`rn` > 1
) AS fix ON fix.`id` = t.`id`
SET t.`displayId` = fix.`newDisplayId`;

-- Renumber duplicate Icebox requests
UPDATE `IceboxItem` AS t
JOIN (
    SELECT d.`id`,
           m.`maxDisplayId` + ROW_NUMBER() OVER (
               PARTITION BY d.`projectId` ORDER BY d.`displayId`, d.`createdAt`, d.`id`
           ) AS `newDisplayId`
      FROM (
          SELECT `id`, `projectId`, `displayId`, `createdAt`,
                 ROW_NUMBER() OVER (
                     PARTITION BY `projectId`, `displayId` ORDER BY `createdAt`, `id`
                 ) AS `rn`
            FROM `IceboxItem`
      ) AS d
      JOIN (
          SELECT `projectId`, MAX(`displayId`) AS `maxDisplayId`
            FROM `IceboxItem`
           GROUP BY `projectId`
      ) AS m ON m.`projectId` = d.`projectId`
     WHERE d.`rn` > 1
) AS fix ON fix.`id` = t.`id`
SET t.`displayId` = fix.`newDisplayId`;

-- CreateIndex
CREATE UNIQUE INDEX `ProductBacklogItem_projectId_displayId_key` ON `ProductBacklogItem`(`projectId`, `displayId`);

-- CreateIndex
CREATE UNIQUE INDEX `IceboxItem_projectId_displayId_key` ON `IceboxItem`(`projectId`, `displayId`);

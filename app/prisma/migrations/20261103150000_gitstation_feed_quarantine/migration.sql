-- K3 review round 2: per-repository quarantine and re-read back-off, and the feed hold count.
-- Additive only: nullable columns and integer columns with a constant default.

-- AlterTable
ALTER TABLE "git_repository" ADD COLUMN     "stationRereadNextAt" TIMESTAMP(3),
ADD COLUMN     "stationWriteFailures" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "git_station_feed" ADD COLUMN     "consecutiveHolds" INTEGER NOT NULL DEFAULT 0;


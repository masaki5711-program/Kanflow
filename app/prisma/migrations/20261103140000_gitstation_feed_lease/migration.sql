-- K3 review: one reader per GitStation feed (lease), and a per-repository "re-read the state" mark.
-- Additive only: nullable columns and one column with a constant default (no rewrite on PostgreSQL 11+).

-- AlterTable
ALTER TABLE "git_repository" ADD COLUMN     "stationRereadAt" TIMESTAMP(3),
ADD COLUMN     "stationRereadFailures" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "git_station_feed" ADD COLUMN     "leaseOwner" VARCHAR(36),
ADD COLUMN     "leaseUntil" TIMESTAMP(3);


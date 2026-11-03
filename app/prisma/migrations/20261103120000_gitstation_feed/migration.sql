-- K3 (GitStationSource): the GitStation integration id of a project, and one feed cursor per
-- (GitStation, integration, token). Additive only: a nullable column and a new, empty table
-- (no rewrite, no lock beyond the brief ACCESS EXCLUSIVE of ADD COLUMN without a default).

-- AlterTable
ALTER TABLE "git_integration" ADD COLUMN     "stationIntegrationId" VARCHAR(64);

-- CreateTable
CREATE TABLE "git_station_feed" (
    "id" TEXT NOT NULL,
    "apiBase" VARCHAR(255) NOT NULL,
    "integrationId" VARCHAR(64) NOT NULL,
    "tokenFingerprint" VARCHAR(32) NOT NULL,
    "cursor" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "readAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_station_feed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "git_station_feed_apiBase_integrationId_tokenFingerprint_key" ON "git_station_feed"("apiBase", "integrationId", "tokenFingerprint");


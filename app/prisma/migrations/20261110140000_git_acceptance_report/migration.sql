-- GitStation deeper integration A1 (docs/integration/gitstation-acceptance-check.md): Kanflow reports the check
-- `kanflow/acceptance` on the head commit of every open merge request linked to PBIs (GitStation Checks API).
--
-- git_integration.stationAcceptanceCheck: the per-project switch (off by default; a report only — whether the check
--   is required for a merge is set in GitStation).
-- git_acceptance_report: what was last reported per (repository, merge request), so the same result on the same head
--   commit is not sent again and a failed report waits (retryAt; longer after consecutive failures, and for the
--   whole repository when the failure is the repository's — failures, repositoryWide). No PBI text: the commit id,
--   the conclusion and a digest of what was sent.
--
-- Lock impact: ADD COLUMN with a constant default is a catalogue change (no table rewrite on PostgreSQL 11+);
-- one new, empty table. Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_integration" ADD COLUMN "stationAcceptanceCheck" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "git_acceptance_report" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "mrRef" VARCHAR(255) NOT NULL,
    "mrSeenAt" TIMESTAMP(3),
    "headCheckedAt" TIMESTAMP(3),
    "headSha" VARCHAR(64),
    "conclusion" VARCHAR(24),
    "digest" VARCHAR(64),
    "reportedAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "lastErrorAt" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "repositoryWide" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_acceptance_report_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "git_acceptance_report_values_chk" CHECK (
        ("headSha" IS NULL OR "headSha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$')
        AND ("conclusion" IS NULL OR "conclusion" IN ('success', 'action_required'))
        AND ("digest" IS NULL OR "digest" ~ '^[0-9a-f]{64}$')
        -- A report is a head commit with its conclusion, digest and time: all four or none.
        AND (("reportedAt" IS NULL) = ("conclusion" IS NULL))
        AND (("reportedAt" IS NULL) = ("digest" IS NULL))
        AND ("reportedAt" IS NULL OR "headSha" IS NOT NULL)
        AND "failures" >= 0
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "git_acceptance_report_repositoryId_mrRef_key" ON "git_acceptance_report"("repositoryId", "mrRef");

-- AddForeignKey
ALTER TABLE "git_acceptance_report" ADD CONSTRAINT "git_acceptance_report_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "git_repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

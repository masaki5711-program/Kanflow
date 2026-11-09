-- plan 11 K4 (F-36): approving / withdrawing a GitStation merge request from Kanflow through GitStation's act-as
-- confirmation (ADR-0025). One row per press of 承認する / 承認を取り消す: the state (sealed) that GitStation's
-- confirmation page carries, bound to the Kanflow user who asked, the merge request link and the head they saw.
--
-- Lock impact: one new, empty table. Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "git_mr_approval_attempt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gitLinkId" TEXT NOT NULL,
    "intent" VARCHAR(16) NOT NULL,
    "headSha" VARCHAR(64) NOT NULL,
    "stateCipher" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimingAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "outcome" VARCHAR(16),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "git_mr_approval_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "git_mr_approval_attempt_values_chk" CHECK (
        "intent" IN ('approve', 'unapprove')
        AND "headSha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'
        AND ("outcome" IS NULL OR "outcome" IN ('approved', 'withdrawn', 'unchanged', 'discarded', 'failed'))
        -- A finished row says how it ended; an open one has no outcome.
        AND (("finishedAt" IS NULL) = ("outcome" IS NULL))
    )
);

-- CreateIndex
CREATE INDEX "git_mr_approval_attempt_userId_createdAt_idx" ON "git_mr_approval_attempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "git_mr_approval_attempt_expiresAt_idx" ON "git_mr_approval_attempt"("expiresAt");

-- CreateIndex
CREATE INDEX "git_mr_approval_attempt_gitLinkId_idx" ON "git_mr_approval_attempt"("gitLinkId");

-- AddForeignKey
ALTER TABLE "git_mr_approval_attempt" ADD CONSTRAINT "git_mr_approval_attempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_mr_approval_attempt" ADD CONSTRAINT "git_mr_approval_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_mr_approval_attempt" ADD CONSTRAINT "git_mr_approval_attempt_gitLinkId_fkey" FOREIGN KEY ("gitLinkId") REFERENCES "git_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;


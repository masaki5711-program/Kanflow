-- plan 11 §5.7 X3 (GitStation ADR-0025 Amendment X3, ADR-0016 Amendment X3): binding / unbinding a GitStation repository
-- to a Kanflow project from the project's settings, through the same act-as confirmation as K4's approvals. The K4
-- attempt table is generalised instead of copied: one row per press, whatever the intent.
--
--   approve / unapprove           gitLinkId + headSha (as before); the binding columns are NULL.
--   binding_set                   stationProjectId (GitStation's repository id) + resolvesWorkItems (the setting the
--                                 person confirms); bindingId when an existing shared binding is changed to code.
--   binding_remove                stationProjectId + bindingId (GitStation's binding id).
--
-- The Kanflow project a binding intent names is the row's projectId (GitStation's claim must name exactly it). Each
-- intent ends with its own outcomes only (git_mr_approval_attempt_outcome_chk).
--
-- Lock impact: the migration runs in one transaction and takes ACCESS EXCLUSIVE on git_mr_approval_attempt (ALTER
-- TABLE) until it commits; the new CHECKs scan the table once inside it. The table is small (rows are purged a day
-- after they expire, at most 20 open per user), so the lock is held for milliseconds; lock_timeout bounds the wait.
-- Append-only: the K4 migration is not edited.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_mr_approval_attempt" ALTER COLUMN "gitLinkId" DROP NOT NULL,
ALTER COLUMN "headSha" DROP NOT NULL,
ADD COLUMN "stationProjectId" BIGINT,
ADD COLUMN "bindingId" BIGINT,
ADD COLUMN "resolvesWorkItems" BOOLEAN;

ALTER TABLE "git_mr_approval_attempt" DROP CONSTRAINT "git_mr_approval_attempt_values_chk";

ALTER TABLE "git_mr_approval_attempt" ADD CONSTRAINT "git_mr_approval_attempt_values_chk" CHECK (
    "intent" IN ('approve', 'unapprove', 'binding_set', 'binding_remove')
    AND ("headSha" IS NULL OR "headSha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$')
    AND ("stationProjectId" IS NULL OR "stationProjectId" > 0)
    AND ("bindingId" IS NULL OR "bindingId" > 0)
    -- A finished row says how it ended; an open one has no outcome.
    AND (("finishedAt" IS NULL) = ("outcome" IS NULL))
);

-- What each intent is bound to: exactly its own columns.
ALTER TABLE "git_mr_approval_attempt" ADD CONSTRAINT "git_mr_approval_attempt_subject_chk" CHECK (
    ("intent" IN ('approve', 'unapprove')
        AND "gitLinkId" IS NOT NULL AND "headSha" IS NOT NULL
        AND "stationProjectId" IS NULL AND "bindingId" IS NULL AND "resolvesWorkItems" IS NULL)
    OR ("intent" = 'binding_set'
        AND "gitLinkId" IS NULL AND "headSha" IS NULL
        AND "stationProjectId" IS NOT NULL AND "resolvesWorkItems" IS NOT NULL)
    OR ("intent" = 'binding_remove'
        AND "gitLinkId" IS NULL AND "headSha" IS NULL
        AND "stationProjectId" IS NOT NULL AND "bindingId" IS NOT NULL AND "resolvesWorkItems" IS NULL)
);

-- How each intent can end (an approval is never "bound", a binding never "approved").
ALTER TABLE "git_mr_approval_attempt" ADD CONSTRAINT "git_mr_approval_attempt_outcome_chk" CHECK (
    "outcome" IS NULL
    OR "outcome" IN ('discarded', 'failed')
    OR ("intent" IN ('approve', 'unapprove') AND "outcome" IN ('approved', 'withdrawn', 'unchanged'))
    OR ("intent" = 'binding_set' AND "outcome" IN ('bound', 'updated', 'unchanged'))
    OR ("intent" = 'binding_remove' AND "outcome" = 'removed')
);

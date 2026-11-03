-- plan 12 E3: 反省点の規則 (lesson rules). One of six fixed kinds (src/lib/plan-lesson-rules/rules.ts) that may change
-- a base schedule; only `confirmed` rules change a plan. Where a rule applies and whether its cited sources are
-- confidential is decided at USE time (src/lib/plan-lesson-rules/scope.ts) — nothing about confidentiality is
-- stored here, only the ids of the cited lesson / PBIs / sprint.
--
-- Lock impact: a new table plus an FK to "Project" (ADD CONSTRAINT takes SHARE ROW EXCLUSIVE on "Project" briefly and
-- validates nothing, the new table being empty). No existing row is rewritten.
-- ON DELETE CASCADE: purging a project from the trash removes its rules, shared ones included (a project's data goes
-- with it; other projects already stop using a shared rule whose cited sources are gone).
-- Append-only: never edit an applied migration, add a new one.

-- CreateTable
CREATE TABLE "plan_lesson_rule" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "params" JSONB NOT NULL,
    "scope" VARCHAR(16) NOT NULL DEFAULT 'project',
    "sourceProjectId" TEXT NOT NULL,
    "lineage" VARCHAR(200),
    "projectType" VARCHAR(40),
    "state" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "sourceLessonId" VARCHAR(191),
    "sourceBacklogItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceSprintId" VARCHAR(191),
    "quote" TEXT,
    "createdByKind" VARCHAR(8) NOT NULL DEFAULT 'human',
    "createdById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "promotionLineage" VARCHAR(200),
    "promotionProjectType" VARCHAR(40),
    "promotionRequestedById" TEXT,
    "promotionRequestedAt" TIMESTAMP(3),
    "promotedById" TEXT,
    "promotedAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_lesson_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_lesson_rule_sourceProjectId_state_idx" ON "plan_lesson_rule"("sourceProjectId", "state");

-- CreateIndex
CREATE INDEX "plan_lesson_rule_scope_state_idx" ON "plan_lesson_rule"("scope", "state");

-- AddForeignKey
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The service validates all of this too; the CHECKs keep a hand-written UPDATE from producing a rule the use-time
-- decision would misread (Prisma does not model CHECKs, so `migrate diff` ignores them).
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_kind_chk"
    CHECK ("kind" IN ('scale_duration', 'add_buffer', 'add_prerequisite', 'add_dependency', 'split', 'cap_parallel'));
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_state_chk" CHECK ("state" IN ('draft', 'confirmed', 'retired'));
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_created_by_kind_chk" CHECK ("createdByKind" IN ('human', 'llm'));
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_params_object_chk" CHECK (jsonb_typeof("params") = 'object');
-- project: no filters. shared: at least one filter, never from a retrospective, never with a quote (removed on promotion).
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_scope_chk" CHECK (
    ("scope" = 'project' AND "lineage" IS NULL AND "projectType" IS NULL)
    OR ("scope" = 'shared' AND ("lineage" IS NOT NULL OR "projectType" IS NOT NULL) AND "sourceSprintId" IS NULL AND "quote" IS NULL)
);
-- A rule in state `confirmed` records who confirmed it and when (a retired rule keeps whatever it had).
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_confirmed_chk"
    CHECK ("state" <> 'confirmed' OR ("confirmedById" IS NOT NULL AND "confirmedAt" IS NOT NULL));
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_retired_chk"
    CHECK ("state" <> 'retired' OR "retiredAt" IS NOT NULL);
-- Only confirmed project rules are widened, so a shared rule is never a draft.
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_shared_not_draft_chk" CHECK ("scope" <> 'shared' OR "state" <> 'draft');
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_quote_len_chk" CHECK ("quote" IS NULL OR char_length("quote") <= 1000);
-- NOT NULL inside the CHECK: Prisma emits String[] as a nullable column, and a NULL list would read as "cites no
-- PBI" — i.e. drop the use-time confidentiality check. Fail closed instead.
ALTER TABLE "plan_lesson_rule" ADD CONSTRAINT "plan_lesson_rule_pbi_count_chk"
    CHECK ("sourceBacklogItemIds" IS NOT NULL AND cardinality("sourceBacklogItemIds") <= 50);

-- plan 12 E4: 稼働量 (member_capacity). A person's own FTE (projectId NULL) or their allocation to one project.
-- No row = FTE 1.0. Deliberately no free-text column: reasons for leave are never stored (plan 12 §4).
-- Overlapping periods of the same (userId, projectId) are refused by the service under a per-user advisory lock
-- (an EXCLUDE constraint would need the btree_gist extension).
--
-- member_capacity_audit keeps who changed a row and the period / FTE before and after (numbers only).
--
-- Lock impact: new, empty tables; its FKs to "User" / "Project" take a brief SHARE ROW EXCLUSIVE and validate
-- nothing. ON DELETE CASCADE: a purged project or user takes its capacity rows with it.
-- Append-only: never edit an applied migration, add a new one.

-- CreateTable
CREATE TABLE "member_capacity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "from" DATE NOT NULL,
    "to" DATE,
    "fte" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_capacity_userId_from_idx" ON "member_capacity"("userId", "from");

-- CreateIndex
CREATE INDEX "member_capacity_projectId_userId_idx" ON "member_capacity"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "member_capacity_audit" (
    "id" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "actorId" TEXT,
    "op" VARCHAR(16) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_capacity_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_capacity_audit_userId_createdAt_idx" ON "member_capacity_audit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "member_capacity_audit_projectId_createdAt_idx" ON "member_capacity_audit"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "member_capacity_audit" ADD CONSTRAINT "member_capacity_audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_capacity_audit" ADD CONSTRAINT "member_capacity_audit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- member_capacity_audit: no FK to member_capacity (the trail outlives a deleted row) and none to "Project" (a
-- purged project's trail keeps its projectId as history; it is never joined). A purged user takes their trail along.
ALTER TABLE "member_capacity_audit" ADD CONSTRAINT "member_capacity_audit_op_chk" CHECK ("op" IN ('create', 'update', 'delete'));

-- Guards the service also enforces (Prisma does not model CHECKs; `migrate diff` ignores them).
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_fte_chk" CHECK ("fte" >= 0 AND "fte" <= 1);
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_period_chk" CHECK ("to" IS NULL OR "to" >= "from");
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_version_chk" CHECK ("version" >= 0);

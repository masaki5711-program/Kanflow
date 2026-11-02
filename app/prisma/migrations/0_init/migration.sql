-- Kanflow v2 PostgreSQL baseline (PostgreSQL 16; platform image
-- timescale/timescaledb:2.28.1-pg16 - TimescaleDB itself is not used here).
--
-- Re-created for PostgreSQL instead of translating the 58 MySQL migrations
-- (docs/plan/00-master-plan.md: "移行のときに PG の最初のマイグレーションを作り直す").
-- Those stay frozen, unchanged, in prisma/migrations-mysql/ for the MySQL
-- production server until the approved cutover (MR K2); this directory is
-- never applied to MySQL (the schema provider is postgresql: Prisma speaks the
-- PostgreSQL protocol and cannot even connect to a MySQL server).
--
-- Body: `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
-- of the schema at this commit - table / column names are identical to the MySQL
-- schema so the K2 data copy maps 1:1. Hand-written: only the two extensions
-- below, which must exist before the CITEXT columns and the trigram indexes.
--   citext   case-insensitive unique keys (User.email / employeeNumber,
--            Section.name, AdminCategory.name, UserProjectCategory.name):
--            utf8mb4_unicode_ci parity.
--   pg_trgm  GIN trigram indexes replacing the MySQL FULLTEXT (ngram) indexes
--            of 20261003010000_fulltext_search / 20261016000000_repo_knowledge;
--            they serve ILIKE '%term%' (Prisma `contains` + mode insensitive)
--            and word_similarity() ranking (services/search/search.fulltext.ts).
-- Both are trusted extensions (PG 13+): the database owner may create them,
-- no superuser needed. Prisma ignores extensions in its drift check.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'member',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'ja',
    "employeeNumber" CITEXT,
    "department" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(32),
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "progressMode" VARCHAR(16) NOT NULL DEFAULT 'manual',
    "version" INTEGER NOT NULL DEFAULT 0,
    "baselineStart" TIMESTAMP(3),
    "baselineEnd" TIMESTAMP(3),
    "ownerId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "durationDays" INTEGER,
    "templateApplicationId" TEXT,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_template" (
    "id" TEXT NOT NULL,
    "builtinKey" VARCHAR(40),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "visibility" VARCHAR(10) NOT NULL DEFAULT 'public',
    "ownerId" TEXT,
    "ownerName" VARCHAR(255),
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" VARCHAR(255),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "plan_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_template_revision" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "visibility" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "editedById" TEXT,
    "editedByName" VARCHAR(255),
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_template_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_template_application" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" VARCHAR(255) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdRootIds" TEXT NOT NULL,
    "appliedById" TEXT,
    "appliedByName" VARCHAR(255),
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_template_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItemDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanItemDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFixedTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFixedTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFixedTaskItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFixedTaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "defaultCapacity" INTEGER NOT NULL DEFAULT 0,
    "sprintDurationDays" INTEGER NOT NULL DEFAULT 7,
    "pointUnit" TEXT NOT NULL DEFAULT 'SP',
    "pointDescription" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ja',
    "bilingualMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectType" TEXT NOT NULL DEFAULT 'software',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "cardColor" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "surveillanceSettings" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "structured" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSection" (
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSection_pkey" PRIMARY KEY ("projectId","sectionId")
);

-- CreateTable
CREATE TABLE "UserSection" (
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSection_pkey" PRIMARY KEY ("userId","sectionId")
);

-- CreateTable
CREATE TABLE "UserProjectFavorite" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProjectFavorite_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "AdminCategory" (
    "id" TEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCategoryAssignment" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "AdminCategoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGoal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IceboxItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "displayId" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "background" TEXT,
    "policyDoc" TEXT,
    "planningDoc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedPo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unreviewed',
    "pbEpic" TEXT,
    "rejectionReason" TEXT,
    "freezeReason" TEXT,
    "poHearingMemo" TEXT,
    "poReviewMemo" TEXT,
    "poFlag" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "IceboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IceboxAttachment" (
    "id" TEXT NOT NULL,
    "iceboxItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IceboxAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBacklogItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "displayId" INTEGER NOT NULL,
    "iceboxItemId" TEXT,
    "initiative" TEXT,
    "epic" TEXT,
    "userStory" TEXT,
    "acceptanceCriteria" TEXT,
    "referenceDoc" TEXT,
    "workloadScore" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "assignedPo" TEXT,
    "poNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_ready',
    "notReadyReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productGoalId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "planItemId" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductBacklogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceptance_criterion" (
    "id" TEXT NOT NULL,
    "pbiId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "given" TEXT,
    "when" TEXT,
    "then" TEXT,
    "text" TEXT,
    "evidenceKind" VARCHAR(16),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "acceptance_criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pbi_attachment" (
    "id" TEXT NOT NULL,
    "backlogItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pbi_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklogItemDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacklogItemDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT,
    "commentId" TEXT,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessageMention" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TeamMessageMention_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "TeamChatRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamChatRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sprintName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "sprintGoal" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "actualScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "retrospectiveMemo" TEXT,
    "retrospectiveKeep" TEXT,
    "retrospectiveProblem" TEXT,
    "retrospectiveTry" TEXT,
    "reviewComment" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyScrumNote" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyScrumNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintBacklogItem" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "pbItemId" TEXT NOT NULL,
    "taskName" TEXT,
    "assignee" TEXT,
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "completedAt" TIMESTAMP(3),
    "completionComment" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "carriedFromId" TEXT,

    CONSTRAINT "SprintBacklogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseBacklogItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planVersion" TEXT,
    "pbItemId" TEXT,
    "iceboxId" TEXT,
    "initiative" TEXT,
    "epic" TEXT,
    "userStory" TEXT,
    "assignedPo" TEXT,
    "releaseVersion" TEXT,
    "releaseDate" TIMESTAMP(3),
    "releaseNote" TEXT,
    "manualLink" TEXT,
    "poNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'staged',
    "metricCategory" VARCHAR(20),
    "metricName" VARCHAR(200),
    "metricUnit" VARCHAR(20),
    "direction" VARCHAR(10) NOT NULL DEFAULT 'decrease',
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "resultValue" DOUBLE PRECISION,
    "annualEffectYen" INTEGER,
    "annualEffectUsd" INTEGER,
    "spaceSavedM2" DOUBLE PRECISION,
    "kaizenStage" VARCHAR(20) NOT NULL DEFAULT 'measuring',
    "standardizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseBacklogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_rollout" (
    "id" TEXT NOT NULL,
    "releaseItemId" TEXT NOT NULL,
    "targetName" VARCHAR(200) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'todo',
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "improvement_rollout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_check" (
    "id" TEXT NOT NULL,
    "releaseItemId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "result" VARCHAR(10),
    "note" TEXT,
    "checkedById" TEXT,
    "checkedByName" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "improvement_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_photo" (
    "id" TEXT NOT NULL,
    "releaseItemId" TEXT NOT NULL,
    "phase" VARCHAR(10) NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "improvement_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sprintId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "color" TEXT NOT NULL DEFAULT 'blue',
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttachmentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "linkUrl" VARCHAR(2048),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProjectCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProjectCategoryAssignment" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "UserProjectCategoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_translation" (
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(191) NOT NULL,
    "field" VARCHAR(64) NOT NULL,
    "source_locale" CHAR(2) NOT NULL,
    "source_hash" VARCHAR(64) NOT NULL,
    "text_ja" TEXT,
    "text_id" TEXT,
    "text_en" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "model" VARCHAR(128),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "translated_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_translation_pkey" PRIMARY KEY ("entity_type","entity_id","field")
);

-- CreateTable
CREATE TABLE "glossary" (
    "id" TEXT NOT NULL,
    "source_locale" CHAR(2) NOT NULL,
    "target_locale" CHAR(2) NOT NULL,
    "term" VARCHAR(255) NOT NULL,
    "term_norm" VARCHAR(255) NOT NULL,
    "translation" VARCHAR(500) NOT NULL,
    "note" TEXT,
    "auto_reverse" BOOLEAN NOT NULL DEFAULT false,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" VARCHAR(191) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "diff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "entityType" VARCHAR(32),
    "entityId" VARCHAR(191),
    "projectId" TEXT,
    "payload" TEXT,
    "dedupeKey" VARCHAR(191),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" VARCHAR(191) NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "via" VARCHAR(8),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentMention" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("commentId","userId")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "toolEvents" TEXT,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(32) NOT NULL,
    "params" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "progress" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "activeKey" VARCHAR(191),
    "resultReportId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "scopes" VARCHAR(191) NOT NULL,
    "projectIds" TEXT,
    "userTokenVersion" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" TEXT NOT NULL,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_integration" (
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'gitlab',
    "tokenCipher" TEXT,
    "tokenHint" VARCHAR(8),
    "autoCompleteOnMerge" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_integration_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "git_repository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "webUrl" VARCHAR(1024) NOT NULL,
    "apiBase" VARCHAR(255) NOT NULL,
    "repoPath" VARCHAR(512) NOT NULL,
    "externalId" INTEGER,
    "tokenCipher" TEXT,
    "tokenHint" VARCHAR(8),
    "syncedAt" TIMESTAMP(3),
    "syncCursor" TIMESTAMP(3),
    "mrCursorAt" TIMESTAMP(3),
    "mrCursorSeen" INTEGER,
    "commitCursorAt" TIMESTAMP(3),
    "commitWindowSec" INTEGER,
    "commitSkips" INTEGER,
    "lookbackCursorAt" TIMESTAMP(3),
    "lookbackWindowSec" INTEGER,
    "lookbackAt" TIMESTAMP(3),
    "syncGeneration" INTEGER DEFAULT 0,
    "lastError" VARCHAR(500),
    "lastErrorAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "aiKnowledge" BOOLEAN NOT NULL DEFAULT false,
    "aiPathFilter" VARCHAR(1000),
    "indexedSha" VARCHAR(64),
    "indexedAt" TIMESTAMP(3),
    "indexedFiles" INTEGER NOT NULL DEFAULT 0,
    "indexTargetSha" VARCHAR(64),
    "indexCursor" VARCHAR(512),
    "indexError" VARCHAR(500),
    "indexErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_chunk" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "heading" VARCHAR(500),
    "anchor" VARCHAR(255),
    "chunkNo" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "blobSha" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repo_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_link" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "backlogItemId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "ref" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "url" VARCHAR(1024) NOT NULL,
    "state" VARCHAR(16),
    "pipeline" VARCHAR(24),
    "author" VARCHAR(191),
    "sourceBranch" VARCHAR(255),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "goneAt" TIMESTAMP(3),
    "declaredById" TEXT,
    "declaredAt" TIMESTAMP(3),
    "scopeCheckedAt" TIMESTAMP(3),
    "outsideScopeCount" INTEGER,
    "outsideScopePaths" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_claim" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "backlogItemId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "sessionId" VARCHAR(100) NOT NULL,
    "branch" VARCHAR(255),
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" VARCHAR(16),
    "releasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_claim_scope" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "value" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_claim_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_board" (
    "projectId" TEXT NOT NULL,
    "checkLabel" VARCHAR(40),
    "budgetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_board_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "milestone_board_seed" (
    "applicationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_board_seed_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "milestone_checklist_state" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "checkedById" TEXT,
    "checkedByName" VARCHAR(255),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_checklist_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceptance_check" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planItemId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "criterion" TEXT,
    "result" VARCHAR(16),
    "witness" VARCHAR(255),
    "checkedAt" TIMESTAMP(3),
    "note" TEXT,
    "recordedById" TEXT,
    "recordedByName" VARCHAR(255),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acceptance_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_item" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planItemId" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "detail" TEXT,
    "assigneeId" TEXT,
    "assigneeName" VARCHAR(255),
    "dueDate" TIMESTAMP(3),
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByName" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "punch_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_photo" (
    "id" TEXT NOT NULL,
    "punchItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMP(3),
    "receivedByName" VARCHAR(255),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_file" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByName" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "plannedYen" DOUBLE PRECISION,
    "actualYen" DOUBLE PRECISION,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_metric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(20),
    "direction" VARCHAR(10) NOT NULL DEFAULT 'decrease',
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_metric_point" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recordedByName" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_metric_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetType" VARCHAR(32) NOT NULL,
    "targetId" VARCHAR(191) NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_release" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "tag" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "url" VARCHAR(1024) NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "source" VARCHAR(16) NOT NULL,
    "signature" VARCHAR(64) NOT NULL,
    "signatureText" VARCHAR(1000) NOT NULL,
    "tool" VARCHAR(100) NOT NULL,
    "errorCode" VARCHAR(64),
    "excerpt" TEXT NOT NULL,
    "sessionRef" VARCHAR(100),
    "branch" VARCHAR(255),
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson" (
    "id" TEXT NOT NULL,
    "signature" VARCHAR(64) NOT NULL,
    "scope" VARCHAR(120) NOT NULL DEFAULT 'global',
    "state" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "symptom" TEXT NOT NULL,
    "cause" TEXT,
    "fix" TEXT,
    "verify" TEXT,
    "evidence" TEXT,
    "errorCode" VARCHAR(64),
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "systemizedRef" VARCHAR(500),
    "preventionProposedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_resolution" (
    "id" TEXT NOT NULL,
    "failureEventId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "diffSummary" TEXT NOT NULL,
    "verifiedCommand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeNumber_key" ON "User"("employeeNumber");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");

-- CreateIndex
CREATE INDEX "PlanItem_projectId_idx" ON "PlanItem"("projectId");

-- CreateIndex
CREATE INDEX "PlanItem_parentId_idx" ON "PlanItem"("parentId");

-- CreateIndex
CREATE INDEX "PlanItem_projectId_sortOrder_idx" ON "PlanItem"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "PlanItem_projectId_deletedAt_idx" ON "PlanItem"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "PlanItem_ownerId_idx" ON "PlanItem"("ownerId");

-- CreateIndex
CREATE INDEX "PlanItem_templateApplicationId_idx" ON "PlanItem"("templateApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_template_builtinKey_key" ON "plan_template"("builtinKey");

-- CreateIndex
CREATE INDEX "plan_template_deletedAt_visibility_idx" ON "plan_template"("deletedAt", "visibility");

-- CreateIndex
CREATE INDEX "plan_template_ownerId_idx" ON "plan_template"("ownerId");

-- CreateIndex
CREATE INDEX "plan_template_revision_templateId_editedAt_idx" ON "plan_template_revision"("templateId", "editedAt");

-- CreateIndex
CREATE INDEX "plan_template_application_projectId_templateId_idx" ON "plan_template_application"("projectId", "templateId");

-- CreateIndex
CREATE INDEX "plan_template_application_templateId_idx" ON "plan_template_application"("templateId");

-- CreateIndex
CREATE INDEX "PlanItemDependency_successorId_idx" ON "PlanItemDependency"("successorId");

-- CreateIndex
CREATE INDEX "PlanItemDependency_projectId_idx" ON "PlanItemDependency"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItemDependency_predecessorId_successorId_key" ON "PlanItemDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "UserFixedTask_userId_idx" ON "UserFixedTask"("userId");

-- CreateIndex
CREATE INDEX "UserFixedTaskItem_groupId_idx" ON "UserFixedTaskItem"("groupId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_name_trgm_idx" ON "Project" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "AiReport_projectId_createdAt_idx" ON "AiReport"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Section_name_key" ON "Section"("name");

-- CreateIndex
CREATE INDEX "ProjectSection_projectId_idx" ON "ProjectSection"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSection_sectionId_idx" ON "ProjectSection"("sectionId");

-- CreateIndex
CREATE INDEX "UserSection_userId_idx" ON "UserSection"("userId");

-- CreateIndex
CREATE INDEX "UserSection_sectionId_idx" ON "UserSection"("sectionId");

-- CreateIndex
CREATE INDEX "UserProjectFavorite_userId_idx" ON "UserProjectFavorite"("userId");

-- CreateIndex
CREATE INDEX "UserProjectFavorite_projectId_idx" ON "UserProjectFavorite"("projectId");

-- CreateIndex
CREATE INDEX "AdminCategory_sectionId_idx" ON "AdminCategory"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminCategory_sectionId_name_key" ON "AdminCategory"("sectionId", "name");

-- CreateIndex
CREATE INDEX "AdminCategoryAssignment_categoryId_idx" ON "AdminCategoryAssignment"("categoryId");

-- CreateIndex
CREATE INDEX "AdminCategoryAssignment_projectId_idx" ON "AdminCategoryAssignment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminCategoryAssignment_categoryId_projectId_key" ON "AdminCategoryAssignment"("categoryId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProductGoal_projectId_idx" ON "ProductGoal"("projectId");

-- CreateIndex
CREATE INDEX "ProductGoal_title_trgm_idx" ON "ProductGoal" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductGoal_description_trgm_idx" ON "ProductGoal" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IceboxItem_projectId_idx" ON "IceboxItem"("projectId");

-- CreateIndex
CREATE INDEX "IceboxItem_projectId_deletedAt_idx" ON "IceboxItem"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "IceboxItem_request_trgm_idx" ON "IceboxItem" USING GIN ("request" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IceboxItem_background_trgm_idx" ON "IceboxItem" USING GIN ("background" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IceboxItem_pbEpic_trgm_idx" ON "IceboxItem" USING GIN ("pbEpic" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "IceboxItem_projectId_displayId_key" ON "IceboxItem"("projectId", "displayId");

-- CreateIndex
CREATE INDEX "IceboxAttachment_iceboxItemId_idx" ON "IceboxAttachment"("iceboxItemId");

-- CreateIndex
CREATE INDEX "ProductBacklogItem_projectId_idx" ON "ProductBacklogItem"("projectId");

-- CreateIndex
CREATE INDEX "ProductBacklogItem_projectId_deletedAt_idx" ON "ProductBacklogItem"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProductBacklogItem_iceboxItemId_idx" ON "ProductBacklogItem"("iceboxItemId");

-- CreateIndex
CREATE INDEX "ProductBacklogItem_productGoalId_idx" ON "ProductBacklogItem"("productGoalId");

-- CreateIndex
CREATE INDEX "ProductBacklogItem_planItemId_idx" ON "ProductBacklogItem"("planItemId");

-- CreateIndex
CREATE INDEX "ProductBacklogItem_initiative_trgm_idx" ON "ProductBacklogItem" USING GIN ("initiative" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductBacklogItem_epic_trgm_idx" ON "ProductBacklogItem" USING GIN ("epic" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductBacklogItem_userStory_trgm_idx" ON "ProductBacklogItem" USING GIN ("userStory" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductBacklogItem_acceptanceCriteria_trgm_idx" ON "ProductBacklogItem" USING GIN ("acceptanceCriteria" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBacklogItem_projectId_displayId_key" ON "ProductBacklogItem"("projectId", "displayId");

-- CreateIndex
CREATE INDEX "acceptance_criterion_pbiId_deletedAt_idx" ON "acceptance_criterion"("pbiId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "acceptance_criterion_pbiId_seq_key" ON "acceptance_criterion"("pbiId", "seq");

-- CreateIndex
CREATE INDEX "pbi_attachment_backlogItemId_idx" ON "pbi_attachment"("backlogItemId");

-- CreateIndex
CREATE INDEX "BacklogItemDependency_successorId_idx" ON "BacklogItemDependency"("successorId");

-- CreateIndex
CREATE INDEX "BacklogItemDependency_projectId_idx" ON "BacklogItemDependency"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BacklogItemDependency_predecessorId_successorId_key" ON "BacklogItemDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "ProjectVisit_projectId_idx" ON "ProjectVisit"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVisit_userId_projectId_key" ON "ProjectVisit"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMessage_commentId_key" ON "TeamMessage"("commentId");

-- CreateIndex
CREATE INDEX "TeamMessage_projectId_createdAt_idx" ON "TeamMessage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamMessage_replyToId_idx" ON "TeamMessage"("replyToId");

-- CreateIndex
CREATE INDEX "TeamMessageAttachment_messageId_idx" ON "TeamMessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "TeamMessageMention_userId_idx" ON "TeamMessageMention"("userId");

-- CreateIndex
CREATE INDEX "TeamChatRead_projectId_idx" ON "TeamChatRead"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamChatRead_userId_projectId_key" ON "TeamChatRead"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");

-- CreateIndex
CREATE INDEX "DailyScrumNote_sprintId_idx" ON "DailyScrumNote"("sprintId");

-- CreateIndex
CREATE INDEX "DailyScrumNote_sprintId_date_idx" ON "DailyScrumNote"("sprintId", "date");

-- CreateIndex
CREATE INDEX "DailyScrumNote_archivedAt_idx" ON "DailyScrumNote"("archivedAt");

-- CreateIndex
CREATE INDEX "SprintBacklogItem_sprintId_idx" ON "SprintBacklogItem"("sprintId");

-- CreateIndex
CREATE INDEX "SprintBacklogItem_pbItemId_idx" ON "SprintBacklogItem"("pbItemId");

-- CreateIndex
CREATE INDEX "SprintBacklogItem_carriedFromId_idx" ON "SprintBacklogItem"("carriedFromId");

-- CreateIndex
CREATE INDEX "SprintBacklogItem_taskName_trgm_idx" ON "SprintBacklogItem" USING GIN ("taskName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ReleaseBacklogItem_projectId_idx" ON "ReleaseBacklogItem"("projectId");

-- CreateIndex
CREATE INDEX "ReleaseBacklogItem_pbItemId_idx" ON "ReleaseBacklogItem"("pbItemId");

-- CreateIndex
CREATE INDEX "improvement_rollout_releaseItemId_sortOrder_idx" ON "improvement_rollout"("releaseItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "improvement_check_releaseItemId_idx" ON "improvement_check"("releaseItemId");

-- CreateIndex
CREATE INDEX "improvement_check_dueDate_checkedAt_notifiedAt_idx" ON "improvement_check"("dueDate", "checkedAt", "notifiedAt");

-- CreateIndex
CREATE INDEX "improvement_photo_releaseItemId_phase_idx" ON "improvement_photo"("releaseItemId", "phase");

-- CreateIndex
CREATE INDEX "CalendarEvent_projectId_idx" ON "CalendarEvent"("projectId");

-- CreateIndex
CREATE INDEX "CalendarEvent_sprintId_idx" ON "CalendarEvent"("sprintId");

-- CreateIndex
CREATE INDEX "AttachmentFolder_projectId_idx" ON "AttachmentFolder"("projectId");

-- CreateIndex
CREATE INDEX "AttachmentFolder_parentId_idx" ON "AttachmentFolder"("parentId");

-- CreateIndex
CREATE INDEX "ProjectAttachment_projectId_idx" ON "ProjectAttachment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectAttachment_folderId_idx" ON "ProjectAttachment"("folderId");

-- CreateIndex
CREATE INDEX "ProjectAttachment_folderId_sortOrder_idx" ON "ProjectAttachment"("folderId", "sortOrder");

-- CreateIndex
CREATE INDEX "UserProjectCategory_userId_idx" ON "UserProjectCategory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProjectCategory_userId_name_key" ON "UserProjectCategory"("userId", "name");

-- CreateIndex
CREATE INDEX "UserProjectCategoryAssignment_categoryId_idx" ON "UserProjectCategoryAssignment"("categoryId");

-- CreateIndex
CREATE INDEX "UserProjectCategoryAssignment_projectId_idx" ON "UserProjectCategoryAssignment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProjectCategoryAssignment_categoryId_projectId_key" ON "UserProjectCategoryAssignment"("categoryId", "projectId");

-- CreateIndex
CREATE INDEX "field_translation_status_priority_requested_at_idx" ON "field_translation"("status", "priority" DESC, "requested_at");

-- CreateIndex
CREATE INDEX "field_translation_text_ja_trgm_idx" ON "field_translation" USING GIN ("text_ja" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "field_translation_text_id_trgm_idx" ON "field_translation" USING GIN ("text_id" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "glossary_source_locale_target_locale_idx" ON "glossary"("source_locale", "target_locale");

-- CreateIndex
CREATE UNIQUE INDEX "glossary_source_locale_target_locale_term_norm_key" ON "glossary"("source_locale", "target_locale", "term_norm");

-- CreateIndex
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_createdAt_idx" ON "ActivityLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_createdAt_idx" ON "ActivityLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_dedupeKey_key" ON "Notification"("recipientId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_createdAt_idx" ON "Comment"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_projectId_createdAt_idx" ON "Comment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "Comment_body_trgm_idx" ON "Comment" USING GIN ("body" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CommentMention_userId_idx" ON "CommentMention"("userId");

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- CreateIndex
CREATE INDEX "ChatThread_projectId_userId_deletedAt_updatedAt_idx" ON "ChatThread"("projectId", "userId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatThread_deletedAt_idx" ON "ChatThread"("deletedAt");

-- CreateIndex
CREATE INDEX "ChatThread_updatedAt_idx" ON "ChatThread"("updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiJob_activeKey_key" ON "AiJob"("activeKey");

-- CreateIndex
CREATE INDEX "AiJob_status_createdAt_idx" ON "AiJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_projectId_createdAt_idx" ON "AiJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_userId_idx" ON "AiJob"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_revokedAt_idx" ON "ApiToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "ApiToken_createdAt_idx" ON "ApiToken"("createdAt");

-- CreateIndex
CREATE INDEX "MetricSnapshot_takenAt_idx" ON "MetricSnapshot"("takenAt");

-- CreateIndex
CREATE INDEX "git_repository_projectId_idx" ON "git_repository"("projectId");

-- CreateIndex
CREATE INDEX "repo_chunk_repositoryId_path_chunkNo_idx" ON "repo_chunk"("repositoryId", "path", "chunkNo");

-- CreateIndex
CREATE INDEX "repo_chunk_projectId_idx" ON "repo_chunk"("projectId");

-- CreateIndex
CREATE INDEX "repo_chunk_path_trgm_idx" ON "repo_chunk" USING GIN ("path" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "repo_chunk_heading_trgm_idx" ON "repo_chunk" USING GIN ("heading" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "repo_chunk_content_trgm_idx" ON "repo_chunk" USING GIN ("content" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "git_link_backlogItemId_idx" ON "git_link"("backlogItemId");

-- CreateIndex
CREATE INDEX "git_link_projectId_occurredAt_idx" ON "git_link"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "git_link_declaredById_idx" ON "git_link"("declaredById");

-- CreateIndex
CREATE UNIQUE INDEX "git_link_repositoryId_kind_ref_backlogItemId_key" ON "git_link"("repositoryId", "kind", "ref", "backlogItemId");

-- CreateIndex
CREATE INDEX "work_claim_projectId_releasedAt_heartbeatAt_idx" ON "work_claim"("projectId", "releasedAt", "heartbeatAt");

-- CreateIndex
CREATE INDEX "work_claim_backlogItemId_releasedAt_idx" ON "work_claim"("backlogItemId", "releasedAt");

-- CreateIndex
CREATE INDEX "work_claim_taskId_idx" ON "work_claim"("taskId");

-- CreateIndex
CREATE INDEX "work_claim_userId_sessionId_idx" ON "work_claim"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "work_claim_scope_claimId_idx" ON "work_claim_scope"("claimId");

-- CreateIndex
CREATE INDEX "milestone_board_seed_projectId_idx" ON "milestone_board_seed"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_checklist_state_planItemId_label_key" ON "milestone_checklist_state"("planItemId", "label");

-- CreateIndex
CREATE INDEX "acceptance_check_projectId_sortOrder_idx" ON "acceptance_check"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "acceptance_check_planItemId_idx" ON "acceptance_check"("planItemId");

-- CreateIndex
CREATE INDEX "punch_item_projectId_status_idx" ON "punch_item"("projectId", "status");

-- CreateIndex
CREATE INDEX "punch_item_planItemId_idx" ON "punch_item"("planItemId");

-- CreateIndex
CREATE INDEX "punch_photo_punchItemId_idx" ON "punch_photo"("punchItemId");

-- CreateIndex
CREATE INDEX "handover_document_projectId_sortOrder_idx" ON "handover_document"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "handover_file_documentId_idx" ON "handover_file"("documentId");

-- CreateIndex
CREATE INDEX "budget_line_projectId_sortOrder_idx" ON "budget_line"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "milestone_metric_projectId_sortOrder_idx" ON "milestone_metric"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_metric_point_metricId_month_key" ON "milestone_metric_point"("metricId", "month");

-- CreateIndex
CREATE INDEX "reaction_projectId_targetType_targetId_idx" ON "reaction"("projectId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_targetType_targetId_userId_emoji_key" ON "reaction"("targetType", "targetId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "git_release_projectId_releasedAt_idx" ON "git_release"("projectId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "git_release_repositoryId_tag_key" ON "git_release"("repositoryId", "tag");

-- CreateIndex
CREATE INDEX "failure_event_signature_createdAt_idx" ON "failure_event"("signature", "createdAt");

-- CreateIndex
CREATE INDEX "failure_event_sessionRef_reportedById_createdAt_idx" ON "failure_event"("sessionRef", "reportedById", "createdAt");

-- CreateIndex
CREATE INDEX "failure_event_projectId_createdAt_idx" ON "failure_event"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "failure_event_createdAt_idx" ON "failure_event"("createdAt");

-- CreateIndex
CREATE INDEX "lesson_state_lastSeenAt_idx" ON "lesson"("state", "lastSeenAt");

-- CreateIndex
CREATE INDEX "lesson_scope_idx" ON "lesson"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_signature_scope_key" ON "lesson"("signature", "scope");

-- CreateIndex
CREATE INDEX "lesson_resolution_lessonId_createdAt_idx" ON "lesson_resolution"("lessonId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_resolution_failureEventId_key" ON "lesson_resolution"("failureEventId");

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_templateApplicationId_fkey" FOREIGN KEY ("templateApplicationId") REFERENCES "plan_template_application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template_revision" ADD CONSTRAINT "plan_template_revision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "plan_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template_application" ADD CONSTRAINT "plan_template_application_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template_application" ADD CONSTRAINT "plan_template_application_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "plan_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItemDependency" ADD CONSTRAINT "PlanItemDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItemDependency" ADD CONSTRAINT "PlanItemDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFixedTask" ADD CONSTRAINT "UserFixedTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFixedTaskItem" ADD CONSTRAINT "UserFixedTaskItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserFixedTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReport" ADD CONSTRAINT "AiReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSection" ADD CONSTRAINT "ProjectSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSection" ADD CONSTRAINT "ProjectSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSection" ADD CONSTRAINT "UserSection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSection" ADD CONSTRAINT "UserSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectFavorite" ADD CONSTRAINT "UserProjectFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectFavorite" ADD CONSTRAINT "UserProjectFavorite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCategory" ADD CONSTRAINT "AdminCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCategoryAssignment" ADD CONSTRAINT "AdminCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AdminCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCategoryAssignment" ADD CONSTRAINT "AdminCategoryAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGoal" ADD CONSTRAINT "ProductGoal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceboxItem" ADD CONSTRAINT "IceboxItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceboxAttachment" ADD CONSTRAINT "IceboxAttachment_iceboxItemId_fkey" FOREIGN KEY ("iceboxItemId") REFERENCES "IceboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBacklogItem" ADD CONSTRAINT "ProductBacklogItem_iceboxItemId_fkey" FOREIGN KEY ("iceboxItemId") REFERENCES "IceboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBacklogItem" ADD CONSTRAINT "ProductBacklogItem_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBacklogItem" ADD CONSTRAINT "ProductBacklogItem_productGoalId_fkey" FOREIGN KEY ("productGoalId") REFERENCES "ProductGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBacklogItem" ADD CONSTRAINT "ProductBacklogItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criterion" ADD CONSTRAINT "acceptance_criterion_pbiId_fkey" FOREIGN KEY ("pbiId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pbi_attachment" ADD CONSTRAINT "pbi_attachment_backlogItemId_fkey" FOREIGN KEY ("backlogItemId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklogItemDependency" ADD CONSTRAINT "BacklogItemDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklogItemDependency" ADD CONSTRAINT "BacklogItemDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVisit" ADD CONSTRAINT "ProjectVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVisit" ADD CONSTRAINT "ProjectVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "TeamMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessageAttachment" ADD CONSTRAINT "TeamMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeamMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessageMention" ADD CONSTRAINT "TeamMessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TeamMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessageMention" ADD CONSTRAINT "TeamMessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatRead" ADD CONSTRAINT "TeamChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamChatRead" ADD CONSTRAINT "TeamChatRead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyScrumNote" ADD CONSTRAINT "DailyScrumNote_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintBacklogItem" ADD CONSTRAINT "SprintBacklogItem_pbItemId_fkey" FOREIGN KEY ("pbItemId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintBacklogItem" ADD CONSTRAINT "SprintBacklogItem_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintBacklogItem" ADD CONSTRAINT "SprintBacklogItem_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "SprintBacklogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseBacklogItem" ADD CONSTRAINT "ReleaseBacklogItem_pbItemId_fkey" FOREIGN KEY ("pbItemId") REFERENCES "ProductBacklogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseBacklogItem" ADD CONSTRAINT "ReleaseBacklogItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_rollout" ADD CONSTRAINT "improvement_rollout_releaseItemId_fkey" FOREIGN KEY ("releaseItemId") REFERENCES "ReleaseBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_check" ADD CONSTRAINT "improvement_check_releaseItemId_fkey" FOREIGN KEY ("releaseItemId") REFERENCES "ReleaseBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_photo" ADD CONSTRAINT "improvement_photo_releaseItemId_fkey" FOREIGN KEY ("releaseItemId") REFERENCES "ReleaseBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentFolder" ADD CONSTRAINT "AttachmentFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentFolder" ADD CONSTRAINT "AttachmentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AttachmentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AttachmentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectCategory" ADD CONSTRAINT "UserProjectCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectCategoryAssignment" ADD CONSTRAINT "UserProjectCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UserProjectCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectCategoryAssignment" ADD CONSTRAINT "UserProjectCategoryAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SprintBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_integration" ADD CONSTRAINT "git_integration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_repository" ADD CONSTRAINT "git_repository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_chunk" ADD CONSTRAINT "repo_chunk_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "git_repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_chunk" ADD CONSTRAINT "repo_chunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_link" ADD CONSTRAINT "git_link_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_link" ADD CONSTRAINT "git_link_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "git_repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_link" ADD CONSTRAINT "git_link_backlogItemId_fkey" FOREIGN KEY ("backlogItemId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_link" ADD CONSTRAINT "git_link_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_claim" ADD CONSTRAINT "work_claim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_claim" ADD CONSTRAINT "work_claim_backlogItemId_fkey" FOREIGN KEY ("backlogItemId") REFERENCES "ProductBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_claim" ADD CONSTRAINT "work_claim_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SprintBacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_claim" ADD CONSTRAINT "work_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_claim_scope" ADD CONSTRAINT "work_claim_scope_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "work_claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_board" ADD CONSTRAINT "milestone_board_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_board_seed" ADD CONSTRAINT "milestone_board_seed_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "plan_template_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_board_seed" ADD CONSTRAINT "milestone_board_seed_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_checklist_state" ADD CONSTRAINT "milestone_checklist_state_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_check" ADD CONSTRAINT "acceptance_check_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_check" ADD CONSTRAINT "acceptance_check_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_item" ADD CONSTRAINT "punch_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_item" ADD CONSTRAINT "punch_item_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_photo" ADD CONSTRAINT "punch_photo_punchItemId_fkey" FOREIGN KEY ("punchItemId") REFERENCES "punch_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_document" ADD CONSTRAINT "handover_document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_file" ADD CONSTRAINT "handover_file_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "handover_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_metric" ADD CONSTRAINT "milestone_metric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_metric_point" ADD CONSTRAINT "milestone_metric_point_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "milestone_metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_release" ADD CONSTRAINT "git_release_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_release" ADD CONSTRAINT "git_release_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "git_repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_event" ADD CONSTRAINT "failure_event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_event" ADD CONSTRAINT "failure_event_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resolution" ADD CONSTRAINT "lesson_resolution_failureEventId_fkey" FOREIGN KEY ("failureEventId") REFERENCES "failure_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resolution" ADD CONSTRAINT "lesson_resolution_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


/**
 * Shared, dependency-free types and the translatable-field table for the
 * JA/ID both-language storage (src/lib/translation). Safe to import from
 * client components.
 */

export type TranslationLocale = "ja" | "id"
export type TranslationStatus = "pending" | "running" | "done" | "failed"

/** One field's both-language text. The source side is always filled. */
export interface FieldTranslation {
  ja: string | null
  id: string | null
  source: TranslationLocale
  status: TranslationStatus
}

/** One entity: field name → both-language text. Fields without a row are absent. */
export type EntityI18n = Partial<Record<string, FieldTranslation>>

export type TranslatableEntity =
  | "project"
  | "product_goal"
  | "icebox_item"
  | "backlog_item"
  | "sprint"
  | "daily_scrum_note"
  | "sprint_task"
  | "release_item"
  | "calendar_event"
  | "plan_item"
  | "fixed_task"
  | "fixed_task_item"
  | "comment"
  | "team_message"

/**
 * Translatable fields per entity with their priority (higher = translated
 * first). Field names match the API/Prisma field names. Deliberately
 * excluded: person names (author, assignee, assignedPo), version labels,
 * link columns (referenceDoc, manualLink), master data, AI reports, chat.
 * Comment bodies are translated at the lowest priority; their @mentions are
 * shielded from the model (translator.ts) and kept verbatim.
 */
export const TRANSLATABLE_FIELDS: Record<TranslatableEntity, Record<string, number>> = {
  project: { name: 10, description: 5, pointDescription: 0 },
  product_goal: { title: 10, description: 5 },
  icebox_item: {
    request: 10,
    background: 5,
    pbEpic: 3,
    policyDoc: 0,
    planningDoc: 0,
    rejectionReason: 0,
    freezeReason: 0,
    poHearingMemo: 0,
    poReviewMemo: 0,
  },
  backlog_item: {
    userStory: 10,
    acceptanceCriteria: 5,
    initiative: 3,
    epic: 3,
    poNote: 0,
    notReadyReason: 0,
  },
  sprint: {
    sprintName: 10,
    sprintGoal: 8,
    reviewComment: 0,
    retrospectiveKeep: 0,
    retrospectiveProblem: 0,
    retrospectiveTry: 0,
    retrospectiveMemo: 0,
  },
  daily_scrum_note: { content: 5 },
  sprint_task: { taskName: 8, completionComment: 0 },
  release_item: { initiative: 3, epic: 3, userStory: 5, releaseNote: 0, poNote: 0 },
  calendar_event: { title: 8, description: 3 },
  plan_item: { name: 8, description: 3, notes: 0 },
  fixed_task: { taskName: 0 },
  fixed_task_item: { taskName: 0 },
  comment: { body: 1 },
  team_message: { body: 1 },
}

/** Physical table per entity (Prisma default naming) — used by the backfill query. */
export const ENTITY_TABLES: Record<TranslatableEntity, string> = {
  project: "Project",
  product_goal: "ProductGoal",
  icebox_item: "IceboxItem",
  backlog_item: "ProductBacklogItem",
  sprint: "Sprint",
  daily_scrum_note: "DailyScrumNote",
  sprint_task: "SprintBacklogItem",
  release_item: "ReleaseBacklogItem",
  calendar_event: "CalendarEvent",
  plan_item: "PlanItem",
  fixed_task: "UserFixedTask",
  fixed_task_item: "UserFixedTaskItem",
  comment: "Comment",
  team_message: "TeamMessage",
}

/**
 * Extra backfill condition per entity (SQL on alias `t`): soft-deleted rows
 * whose text is never shown must not be sent to the model.
 */
export const ENTITY_LIVE_FILTER: Partial<Record<TranslatableEntity, string>> = {
  comment: "t.`deletedAt` IS NULL",
  // Mirrors of comments have no own body (the comment is translated instead).
  team_message: "t.`deletedAt` IS NULL AND t.`body` IS NOT NULL",
}

export function translationPriority(entity: TranslatableEntity, field: string): number {
  return TRANSLATABLE_FIELDS[entity]?.[field] ?? 0
}

export function isTranslatableEntity(value: string): value is TranslatableEntity {
  return Object.prototype.hasOwnProperty.call(TRANSLATABLE_FIELDS, value)
}

/** One glossary term as handed to the model. */
export interface GlossaryTerm {
  term: string
  translation: string
}

export interface GlossaryEntry extends GlossaryTerm {
  id: string
  sourceLocale: TranslationLocale
  targetLocale: TranslationLocale
  note: string | null
  autoReverse: boolean
  usageCount: number
  updatedAt: string
}

/**
 * - separate-process: external mode — the standalone worker (kanflow-worker)
 *   runs the loop; this web process never does, by design.
 * - this-process: inprocess mode and the loop runs in this web process.
 * - not-started: inprocess mode but this process did not start the loop.
 * - off: background translation disabled.
 */
export type TranslationWorkerLocation = "separate-process" | "this-process" | "not-started" | "off"

export interface TranslationStats {
  pending: number
  running: number
  done: number
  failed: number
  lastError: {
    entityType: string
    entityId: string
    field: string
    error: string
    at: string
  } | null
  /** Idle / background counters of THIS web process (meaningful only when workerLocation is "this-process"). */
  workerIdle: boolean
  /** Background translation is switched on (mode !== "off"), wherever it runs. */
  workerEnabled: boolean
  /** AI_TRANSLATION_WORKER mode ("external" | "inprocess" | "off"). */
  workerMode: "external" | "inprocess" | "off"
  /** Where the loop runs, as seen from the process answering this request. */
  workerLocation: TranslationWorkerLocation
  /** Plain-English explanation of workerLocation (for API consumers / logs). */
  workerNote: string
  highActive: number
  backgroundActive: number
  ollamaReachable: boolean
  model: string
}

import type { Prisma } from "@/generated/prisma/client"
import { syncPbiStatusFromTasks } from "@/lib/pbi-status-sync"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logCreate, logDelete, logUpdate, type ActivityChanges } from "@/services/_shared/activity"
import { parseDateOrThrow } from "@/services/_shared/dates"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import { notify, projectMemberIds, type NotificationType } from "@/services/_shared/notifications"
import { attachI18n, attachI18nOne, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import { noteUnversionedWrite, staleOrMissing, takeVersion } from "@/services/_shared/versioning"
import { withAssigneeRefs } from "@/services/sprint-backlog/task-assignees"
import { computeBurndown, type BurndownData } from "./burndown"
import { launchSprintCompletionReview } from "./sprint-completion-review"
import * as repo from "./sprints.repository"
import type { CreateSprintInput, UpdateSprintInput } from "./sprints.schemas"

export async function listSprints(projectId: string) {
  const sprints = await repo.findSprints(defaultDb, projectId)
  // Sprint text, sprint task names, and the PBIs shown inside each sprint.
  const allItems = sprints.flatMap((s) => s.items)
  const [withI18n, taskI18n, pbI18n] = await Promise.all([
    attachI18n("sprint", sprints),
    getI18nFor("sprint_task", allItems.map((i) => i.id)),
    getI18nFor("backlog_item", allItems.map((i) => i.pbItemId)),
  ])
  return withI18n.map((s) => ({
    ...s,
    items: s.items.map((it) => ({
      ...withAssigneeRefs(it),
      i18n: taskI18n.get(it.id) ?? {},
      pbItem: { ...it.pbItem, i18n: pbI18n.get(it.pbItem.id) ?? {} },
    })),
  }))
}

type TaskDto<T extends object> = ReturnType<typeof withAssigneeRefs<T>>

/** Sprint row → DTO: tasks carry `assignees: [{ id, name }]` (new objects; a row without items is returned as is). */
function withTaskAssignees<T extends object, S extends { items: readonly T[] }>(sprint: S): Omit<S, "items"> & { items: TaskDto<T>[] } {
  const items = (sprint.items as readonly T[] | undefined)?.map((it) => withAssigneeRefs(it))
  // Test doubles may omit the relation; real rows always load it.
  return (items ? { ...sprint, items } : sprint) as unknown as Omit<S, "items"> & { items: TaskDto<T>[] }
}

export async function getSprint(projectId: string, sprintId: string) {
  const sprint = await repo.findSprintDetail(defaultDb, projectId, sprintId)
  if (!sprint) throw new NotFoundError()
  return attachI18nOne("sprint", withTaskAssignees(sprint))
}

const sprintNotFound = () => new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND")

/** Error for a versioned sprint write that matched nothing: 409 with the current sprint, or 404. */
async function sprintWriteMiss(tx: Db, projectId: string, sprintId: string) {
  const current = await repo.findSprintDetail(tx, projectId, sprintId)
  return staleOrMissing(current && (await attachI18nOne("sprint", withTaskAssignees(current))), sprintNotFound)
}

/**
 * Guard against sprint sprawl: no new sprint while a planning / active one
 * exists (409 with the blocker). Selected PBIs outside the project are ignored.
 */
export async function createSprint(projectId: string, input: CreateSprintInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const startDate = parseDateOrThrow(data.startDate)
  const endDate = parseDateOrThrow(data.endDate)
  return withTransaction(async (tx) => {
    const blocker = await repo.findOpenSprint(tx, projectId)
    if (blocker) throw new ConflictError("進行中または計画中のスプリントが既にあります", { blocker }, "SPRINT_ACTIVE_EXISTS")
    const requested = data.selectedPbIds ?? []
    const valid = requested.length
      ? new Set((await repo.findProjectPbiIds(tx, projectId, requested)).map((p) => p.id))
      : new Set<string>()
    const pbIds = requested.filter((id) => valid.has(id))
    const sprint = await repo.insertSprint(tx, {
      projectId,
      sprintName: data.sprintName,
      startDate,
      endDate,
      sprintGoal: data.sprintGoal,
      capacity: data.capacity ?? 0,
      status: "planning",
    }, pbIds)
    await enqueueIn(tx, "sprint", sprint.id, sprint)
    await logCreate(tx, { projectId, entityType: "sprint", entityId: sprint.id, actor, row: sprint, meta: { pbCount: pbIds.length } })
    return sprint
  })
}

/** Pure: PATCH payload. "done" is promoted to "archived" (the UX treats them as one step). */
export function buildSprintUpdate(data: UpdateSprintInput): Prisma.SprintUncheckedUpdateInput {
  return {
    ...data,
    ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
    ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
    ...(data.status === "done" ? { status: "archived" } : {}),
  }
}

const ENDED_STATUSES: ReadonlySet<string> = new Set(["done", "archived"])

/** Pure: sprint_start when a sprint becomes active, sprint_end when it ends; else null. */
export function sprintLifecycleNotification(changes: ActivityChanges): NotificationType | null {
  const change = changes.status
  if (!change || !("to" in change)) return null
  if (change.to === "active") return "sprint_start"
  if (typeof change.to === "string" && ENDED_STATUSES.has(change.to) && !ENDED_STATUSES.has(String(change.from))) return "sprint_end"
  return null
}

interface LifecycleSprint {
  id: string
  sprintName: string
  startDate: Date
  endDate: Date
}

/** Notify every project member once per sprint and type (dedupeKey). */
async function notifySprintLifecycle(tx: Db, projectId: string, sprint: LifecycleSprint, type: NotificationType, actor: Actor) {
  await notify(tx, {
    recipientIds: await projectMemberIds(tx, projectId),
    actorId: actor.userId,
    type,
    projectId,
    entityType: "sprint",
    entityId: sprint.id,
    payload: {
      sprintName: sprint.sprintName,
      startDate: sprint.startDate.toISOString(),
      endDate: sprint.endDate.toISOString(),
      actorName: actor.userName,
    },
    dedupeKey: `${type}:${sprint.id}`,
  })
}

/** `input.version` (optional) = the version the client loaded; stale → 409 VERSION_CONFLICT with `current`. */
export async function updateSprint(projectId: string, sprintId: string, input: UpdateSprintInput, actor: Actor) {
  const { version, data: fields } = takeVersion(input)
  noteUnversionedWrite("sprint", sprintId, version)
  const data = await prepareText(fields, actor.userId)
  const sprint = await withTransaction(async (tx) => {
    const before = await loadSnapshot(tx, "sprint", sprintId)
    const updated = await repo.updateSprint(tx, projectId, sprintId, buildSprintUpdate(data), version)
    if (!updated) throw await sprintWriteMiss(tx, projectId, sprintId)
    await enqueueIn(tx, "sprint", updated.id, data)
    const changes = await logUpdate(tx, { projectId, entityType: "sprint", entityId: sprintId, actor, before, after: updated })
    const lifecycle = sprintLifecycleNotification(changes)
    if (lifecycle) await notifySprintLifecycle(tx, projectId, updated, lifecycle, actor)
    return updated
  })
  // Completing a sprint (done → auto-archived) launches the AI completion review after commit.
  if (data.status === "done") launchSprintCompletionReview(projectId, sprintId, sprint.sprintName)
  return attachI18nOne("sprint", withTaskAssignees(sprint))
}

/**
 * Deletes the sprint; its tasks and daily scrum notes cascade. In the same
 * transaction: purge translations of the sprint, tasks and notes, and
 * re-sync the status of the PBIs that lost tasks. Calendar events keep
 * existing (sprintId → NULL).
 */
export async function deleteSprint(projectId: string, sprintId: string, actor: Actor | null = null, version?: number): Promise<void> {
  noteUnversionedWrite("sprint", sprintId, version)
  await withTransaction(async (tx) => {
    const { tasks, notes } = await repo.findSprintChildren(tx, sprintId)
    const row = await loadSnapshot(tx, "sprint", sprintId)
    if ((await repo.deleteSprint(tx, projectId, sprintId, version)) === 0) throw await sprintWriteMiss(tx, projectId, sprintId)
    await logDelete(tx, { projectId, entityType: "sprint", entityId: sprintId, actor, row, meta: { taskCount: tasks.length } })
    await purgeIn(tx, {
      sprint: [sprintId],
      sprint_task: tasks.map((t) => t.id),
      daily_scrum_note: notes.map((n) => n.id),
    })
    for (const pbItemId of new Set(tasks.map((t) => t.pbItemId))) {
      await syncPbiStatusFromTasks(pbItemId, tx)
    }
  })
}

export async function getBurndown(projectId: string): Promise<BurndownData> {
  const newestFirst = await repo.findBurndownSprints(defaultDb, projectId)
  return computeBurndown([...newestFirst].reverse())
}

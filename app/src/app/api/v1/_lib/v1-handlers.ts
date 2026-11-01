import { can, type ProjectActor } from "@/lib/authz"
import type { Actor } from "@/services/_shared/actor"
import { createAcceptanceCriterionSchema, updateAcceptanceCriterionSchema } from "@/services/acceptance-criteria/acceptance-criteria.schemas"
import { createAcceptanceCriterion, deleteAcceptanceCriterion, listAcceptanceCriteria, updateAcceptanceCriterion } from "@/services/acceptance-criteria/acceptance-criteria.service"
import { updateBacklogItemSchema, createBacklogItemSchema } from "@/services/backlog/backlog.schemas"
import { createBacklogItem, updateBacklogItem } from "@/services/backlog/backlog.service"
import { createCommentSchema, listCommentsQuerySchema } from "@/services/comments/comments.schemas"
import { createComment, listComments } from "@/services/comments/comments.service"
import { createDailyScrumSchema } from "@/services/daily-scrums/daily-scrums.schemas"
import { createNote } from "@/services/daily-scrums/daily-scrums.service"
import { createIceboxItemSchema } from "@/services/icebox/icebox.schemas"
import { createIceboxItem } from "@/services/icebox/icebox.service"
import { addSprintPbisSchema, createTaskSchema, updateTaskSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { addPbisToSprint, createTask, updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { createSprintSchema, updateSprintSchema } from "@/services/sprints/sprints.schemas"
import { createSprint, updateSprint } from "@/services/sprints/sprints.service"
import { maskCommentEntityId, maskPbiIds, maskPbiRef, maskTaskId, withoutConfidentialItems } from "@/services/api-v1/api-v1.confidential"
import { findSimilarTasks, getPbi } from "@/services/api-v1/api-v1.service"
import { V1Reply } from "./v1-route"

/**
 * The operations behind the v1 write routes and the matching MCP tools
 * (docs/mcp.md), so both surfaces run the same schema and the same service
 * call. Authorization is not here: the caller resolved `actor` through
 * resolveV1ProjectActor and runs the handler through runV1Write.
 *
 * Confidential PBIs (D-5, api-v1.confidential.ts): an operation that names a confidential PBI, or a
 * task / comment thread under one, hands the service an id that cannot exist (mask*), so the answer
 * is exactly the one for a missing PBI. Every operation in this file and in v1-dev-handlers.ts is
 * classified in confidential-coverage.ts.
 */

export interface V1WriteInput<P = object> {
  projectId: string
  actor: ProjectActor
  /** Unvalidated: each handler parses it with the UI route's schema. */
  body: unknown
  serviceActor: Actor
  params: P
}

/**
 * Ordering belongs to `backlog:reorder` (the UI's PUT /backlog/reorder), not to a field edit.
 * `confidential` (D-5) is a decision of the people in the web UI: a token can neither set nor clear it.
 */
export const v1UpdatePbiSchema = updateBacklogItemSchema.omit({ sortOrder: true, confidential: true })

/** Create a PBI — `backlog.write`. */
export async function createPbiOp({ projectId, body, serviceActor }: V1WriteInput) {
  return { data: await createBacklogItem(projectId, createBacklogItemSchema.parse(body), serviceActor) }
}

/** Edit a PBI (`itemId` = id, "12" or "PBI-12"; sortOrder is not accepted) — `backlog.write`. */
export async function updatePbiOp({ projectId, params, body, serviceActor }: V1WriteInput<{ itemId: string }>) {
  const input = v1UpdatePbiSchema.parse(body)
  const { data: pbi } = await getPbi(projectId, params.itemId)
  return { data: await updateBacklogItem(projectId, pbi.id, input, serviceActor) }
}

/** Add an acceptance criterion to a PBI (`itemId` = id, "12" or "PBI-12") — `backlog.write`. */
export async function createAcceptanceCriterionOp({ projectId, params, body, serviceActor }: V1WriteInput<{ itemId: string }>) {
  const itemId = await maskPbiRef(projectId, params.itemId)
  return { data: await createAcceptanceCriterion(projectId, itemId, createAcceptanceCriterionSchema.parse(body), serviceActor) }
}

/** Edit an acceptance criterion (`acRef` = "AC-2", "2" or "PBI-12/AC-2"; `seq` never changes) — `backlog.write`. */
export async function updateAcceptanceCriterionOp({ projectId, params, body, serviceActor }: V1WriteInput<{ itemId: string; acRef: string }>) {
  const itemId = await maskPbiRef(projectId, params.itemId)
  return { data: await updateAcceptanceCriterion(projectId, itemId, params.acRef, updateAcceptanceCriterionSchema.parse(body), serviceActor) }
}

/** Delete (soft) an acceptance criterion; its number is never reused — `backlog.write`. */
export async function deleteAcceptanceCriterionOp({ projectId, params, serviceActor }: V1WriteInput<{ itemId: string; acRef: string }>) {
  return { data: await deleteAcceptanceCriterion(projectId, await maskPbiRef(projectId, params.itemId), params.acRef, serviceActor) }
}

/** The acceptance criteria of a PBI (read; `itemId` = id, "12" or "PBI-12"). */
export async function listAcceptanceCriteriaOp(projectId: string, itemId: string) {
  return listAcceptanceCriteria(projectId, await maskPbiRef(projectId, itemId))
}

/** A sprint answer without the tasks (and their PBI rows) of confidential PBIs. */
async function withoutConfidentialTasks<S extends { items: readonly object[] }>(sprint: S): Promise<S> {
  // Every item of a sprint answer is a sprint task row, which carries its PBI's id as `pbItemId`.
  const items = await withoutConfidentialItems(sprint.items, (item) => (item as { pbItemId: string }).pbItemId)
  return { ...sprint, items }
}

/** Create a sprint — `sprint.manage`. */
export async function createSprintOp({ projectId, body, serviceActor }: V1WriteInput) {
  const input = createSprintSchema.parse(body)
  const masked = {
    ...input,
    ...(input.selectedPbIds ? { selectedPbIds: await maskPbiIds(input.selectedPbIds) } : {}),
    ...(input.carryOver ? { carryOver: { ...input.carryOver, pbItemIds: await maskPbiIds(input.carryOver.pbItemIds) } } : {}),
  }
  return { data: await withoutConfidentialTasks(await createSprint(projectId, masked, serviceActor)) }
}

/** Edit a sprint — `sprint.manage`. */
export async function updateSprintOp({ projectId, params, body, serviceActor }: V1WriteInput<{ sprintId: string }>) {
  return { data: await withoutConfidentialTasks(await updateSprint(projectId, params.sprintId, updateSprintSchema.parse(body), serviceActor)) }
}

/** Add PBIs to a sprint (201 when something was added, 200 when all were already in it) — `sprint.manage`. */
export async function addSprintPbisOp({ projectId, params, body, serviceActor }: V1WriteInput<{ sprintId: string }>) {
  const { pbIds } = addSprintPbisSchema.parse(body)
  const result = await addPbisToSprint(projectId, params.sprintId, await maskPbiIds(pbIds), serviceActor)
  return new V1Reply({ data: result }, result.added === 0 ? 200 : 201)
}

/**
 * Create a task under a PBI of the sprint — `task.write`. `similar` (only when non-empty):
 * tasks of the same PBI in the sprint that already had the same name (case / spacing
 * ignored) — a duplicate hint for AI agents, never a refusal.
 */
export async function createTaskOp({ projectId, params, body, serviceActor }: V1WriteInput<{ sprintId: string }>) {
  const parsed = createTaskSchema.parse(body)
  const input = { ...parsed, pbItemId: await maskPbiRef(projectId, parsed.pbItemId) }
  // Looked up before the create, so the new task is not its own duplicate.
  const similar = (await findSimilarTasks(projectId, params.sprintId, input.pbItemId, input.taskName)) ?? []
  const data = await createTask(projectId, params.sprintId, input, serviceActor)
  return similar.length > 0 ? { data, similar } : { data }
}

/** Edit a task (status, hours, assignees, name) — `task.write`. */
export async function updateTaskOp({ projectId, params, body, serviceActor }: V1WriteInput<{ sprintId: string; taskId: string }>) {
  return { data: await updateTask(projectId, params.sprintId, await maskTaskId(params.taskId), updateTaskSchema.parse(body), serviceActor) }
}

/** A daily scrum note of the sprint — `dailyScrum.write`. */
export async function createDailyScrumOp({ projectId, params, body, serviceActor }: V1WriteInput<{ sprintId: string }>) {
  return { data: await createNote(projectId, params.sprintId, createDailyScrumSchema.parse(body), serviceActor) }
}

/** A comment on a PBI / task / Icebox item — `comment.write`. */
export async function createCommentOp({ projectId, body, serviceActor, actor }: V1WriteInput) {
  const input = createCommentSchema.parse(body)
  const entityId = await maskCommentEntityId(projectId, input.entityType, input.entityId)
  return { data: await createComment(projectId, { ...input, entityId }, serviceActor, can(actor, "comment.moderate")) }
}

/** Submit a request to the Icebox — `icebox.write`. */
export async function createIceboxItemOp({ projectId, body, serviceActor }: V1WriteInput) {
  return { data: await createIceboxItem(projectId, createIceboxItemSchema.parse(body), serviceActor) }
}

/** One comment thread, oldest first, with the viewer's moderation right (read). */
export async function listCommentsOp(projectId: string, actor: ProjectActor, query: unknown) {
  const parsed = listCommentsQuerySchema.parse(query)
  const entityId = await maskCommentEntityId(projectId, parsed.entityType, parsed.entityId)
  const page = await listComments(projectId, { ...parsed, entityId }, {
    userId: actor.userId,
    canModerate: can(actor, "comment.moderate"),
  })
  return { data: page.items, nextCursor: page.nextCursor }
}

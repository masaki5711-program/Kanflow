/**
 * Comments on PBIs, sprint tasks and Icebox items (+ @mentions).
 *
 * - Threads are listed oldest first with a keyset cursor.
 * - Only the author edits a comment; the author or a moderator
 *   (`comment.moderate`, decided by the route) deletes it. Deletion is soft:
 *   the row stays as a tombstone whose body is never sent to clients.
 * - Mentions (`@[Name]` / `@token`, see lib/mentions.ts) are resolved against
 *   the project's members and stored as CommentMention rows.
 * - Notifications: "mentioned" to mentioned users; "comment" to the item's
 *   people (PBI PO, task assignees, Icebox author / PO) except the author and
 *   the users already notified as mentioned.
 * - A new comment records one "comment" activity row on the commented entity.
 */
import { resolveAssignees, type AssigneeCandidate } from "@/lib/assignees"
import { commentExcerpt, resolveMentionUserIds } from "@/lib/mentions"
import type { Actor } from "@/services/_shared/actor"
import { LABEL_MAX, logActivity } from "@/services/_shared/activity"
import { toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ForbiddenError, NotFoundError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import * as repo from "./comments.repository"
import type {
  CommentCountsQuery,
  CommentEntityType,
  CreateCommentInput,
  ListCommentsQuery,
  UpdateCommentInput,
} from "./comments.schemas"

/** Who is looking at / acting on comments (moderation is decided by the route's policy check). */
export interface CommentViewer {
  userId: string
  canModerate: boolean
}

interface CommentRow {
  id: string
  entityType: string
  entityId: string
  authorId: string
  body: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  author: { id: string; name: string } | null
  mentions: { user: { id: string; name: string } }[]
}

/** One comment as the API returns it. A deleted comment has `body: null` and `deleted: true`. */
export interface CommentDto {
  id: string
  entityType: string
  entityId: string
  author: { id: string; name: string } | null
  body: string | null
  deleted: boolean
  mentions: { id: string; name: string }[]
  createdAt: string
  editedAt: string | null
  canEdit: boolean
  canDelete: boolean
}

/** Pure: DB row → DTO for `viewer` (tombstones hide body and mentions). */
export function toCommentDto(row: CommentRow, viewer: CommentViewer): CommentDto {
  const deleted = row.deletedAt !== null
  const isAuthor = row.authorId === viewer.userId
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    author: row.author,
    body: deleted ? null : row.body,
    deleted,
    mentions: deleted ? [] : row.mentions.map((m) => m.user),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    canEdit: !deleted && isAuthor,
    canDelete: !deleted && (isAuthor || viewer.canModerate),
  }
}

/** The commented entity, normalized for labels and notification recipients. */
export interface CommentTarget {
  entityType: CommentEntityType
  entityId: string
  label: string | null
  /** Users responsible for the entity (notified of new comments). */
  recipientIds: string[]
  /** Extra notification payload (e.g. sprintId / displayId for deep links). */
  meta: Record<string, unknown>
}

function firstLine(text: string | null | undefined): string | null {
  const line = text?.trim().split(/\r?\n/)[0]?.trim()
  if (!line) return null
  return line.length > LABEL_MAX ? `${line.slice(0, LABEL_MAX - 1)}…` : line
}

function withDisplayId(displayId: number, text: string | null | undefined): string {
  const head = firstLine(text)
  return head ? `#${displayId} ${head}` : `#${displayId}`
}

/** User ids of the members named in legacy name strings (unknown / ambiguous names dropped). */
function namesToUserIds(raws: readonly (string | null | undefined)[], members: readonly AssigneeCandidate[]): string[] {
  const ids = raws.flatMap((raw) => resolveAssignees(raw, members).userIds)
  return [...new Set(ids)]
}

/** Load the live entity being commented on; 404 when missing, trashed or outside the project. */
export async function loadTarget(
  db: Db,
  projectId: string,
  entityType: CommentEntityType,
  entityId: string,
  members: readonly AssigneeCandidate[] = []
): Promise<CommentTarget> {
  const notFound = () => new NotFoundError("Comment target not found")
  switch (entityType) {
    case "pbi": {
      const pbi = await repo.findPbiTarget(db, projectId, entityId)
      if (!pbi) throw notFound()
      return {
        entityType,
        entityId,
        label: withDisplayId(pbi.displayId, pbi.initiative || pbi.userStory),
        recipientIds: namesToUserIds([pbi.assignedPo], members),
        meta: { displayId: pbi.displayId },
      }
    }
    case "sprint_task": {
      const task = await repo.findSprintTaskTarget(db, projectId, entityId)
      if (!task) throw notFound()
      const normalized = task.assignees.map((a) => a.userId)
      return {
        entityType,
        entityId,
        label: firstLine(task.taskName),
        recipientIds: [...new Set([...normalized, ...namesToUserIds([task.assignee], members)])],
        meta: { sprintId: task.sprintId },
      }
    }
    case "icebox": {
      const item = await repo.findIceboxTarget(db, projectId, entityId)
      if (!item) throw notFound()
      return {
        entityType,
        entityId,
        label: withDisplayId(item.displayId, item.request),
        recipientIds: namesToUserIds([item.author, item.assignedPo], members),
        meta: { displayId: item.displayId },
      }
    }
  }
}

export async function listComments(projectId: string, query: ListCommentsQuery, viewer: CommentViewer): Promise<Page<CommentDto>> {
  await loadTarget(defaultDb, projectId, query.entityType, query.entityId)
  const rows = await repo.findComments(defaultDb, projectId, query.entityType, query.entityId, query)
  return toPage(rows, query.limit, (row) => toCommentDto(row, viewer))
}

/** `{ counts: { [entityId]: n } }` — live comments per requested id (0 when none). */
export async function getCommentCounts(projectId: string, query: CommentCountsQuery): Promise<{ counts: Record<string, number> }> {
  const found = await repo.countComments(defaultDb, projectId, query.entityType, query.ids)
  return { counts: Object.fromEntries(query.ids.map((id) => [id, found.get(id) ?? 0])) }
}

interface NotifyContext {
  projectId: string
  commentId: string
  body: string
  target: CommentTarget
  actor: Actor
}

function payloadOf(ctx: NotifyContext): Record<string, unknown> {
  return {
    ...ctx.target.meta,
    entityLabel: ctx.target.label,
    actorName: ctx.actor.userName,
    excerpt: commentExcerpt(ctx.body),
    entityType: ctx.target.entityType,
    entityId: ctx.target.entityId,
    commentId: ctx.commentId,
  }
}

async function notifyMentioned(tx: Db, ctx: NotifyContext, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return
  await notify(tx, {
    recipientIds: userIds,
    actorId: ctx.actor.userId,
    type: "mentioned",
    projectId: ctx.projectId,
    entityType: ctx.target.entityType,
    entityId: ctx.target.entityId,
    payload: payloadOf(ctx),
    dedupeKey: `comment:${ctx.commentId}:mentioned`,
  })
}

async function notifyParticipants(tx: Db, ctx: NotifyContext, exclude: readonly string[]): Promise<void> {
  const recipients = ctx.target.recipientIds.filter((id) => !exclude.includes(id))
  if (recipients.length === 0) return
  await notify(tx, {
    recipientIds: recipients,
    actorId: ctx.actor.userId,
    type: "comment",
    projectId: ctx.projectId,
    entityType: ctx.target.entityType,
    entityId: ctx.target.entityId,
    payload: payloadOf(ctx),
    dedupeKey: `comment:${ctx.commentId}`,
  })
}

async function reload(tx: Db, projectId: string, commentId: string) {
  const row = await repo.findComment(tx, projectId, commentId)
  if (!row) throw new NotFoundError("Comment not found")
  return row
}

export async function createComment(
  projectId: string,
  input: CreateCommentInput,
  actor: Actor,
  canModerate = false
): Promise<CommentDto> {
  const row = await withTransaction(async (tx) => {
    const members = await repo.findMentionCandidates(tx, projectId)
    const target = await loadTarget(tx, projectId, input.entityType, input.entityId, members)
    const mentionIds = resolveMentionUserIds(input.body, members)
    const { id } = await repo.createComment(tx, {
      projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      authorId: actor.userId,
      body: input.body,
    })
    await repo.replaceMentions(tx, id, mentionIds)
    await logActivity(tx, {
      projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: "comment",
      actor,
      // No excerpt: a later-deleted comment must not survive in the history.
      diff: { label: target.label ?? undefined, meta: { commentId: id } },
    })
    const ctx: NotifyContext = { projectId, commentId: id, body: input.body, target, actor }
    await notifyMentioned(tx, ctx, mentionIds)
    await notifyParticipants(tx, ctx, mentionIds)
    return reload(tx, projectId, id)
  })
  return toCommentDto(row, { userId: actor.userId, canModerate })
}

/** Load a live comment of the project (404 when missing or deleted). */
async function loadLiveComment(db: Db, projectId: string, commentId: string) {
  const row = await repo.findComment(db, projectId, commentId)
  if (!row || row.deletedAt !== null) throw new NotFoundError("Comment not found")
  return row
}

/** Author only. Re-resolves mentions; only newly mentioned users are notified. */
export async function updateComment(
  projectId: string,
  commentId: string,
  input: UpdateCommentInput,
  actor: Actor,
  canModerate = false,
  now: Date = new Date()
): Promise<CommentDto> {
  const row = await withTransaction(async (tx) => {
    const current = await loadLiveComment(tx, projectId, commentId)
    if (current.authorId !== actor.userId) throw new ForbiddenError("Only the author can edit this comment")
    if (current.body === input.body) return current
    const members = await repo.findMentionCandidates(tx, projectId)
    const target = await loadTarget(tx, projectId, current.entityType as CommentEntityType, current.entityId, members)
    const before = current.mentions.map((m) => m.user.id)
    const mentionIds = resolveMentionUserIds(input.body, members)
    await repo.updateCommentBody(tx, commentId, input.body, now)
    await repo.replaceMentions(tx, commentId, mentionIds)
    const added = mentionIds.filter((id) => !before.includes(id))
    await notifyMentioned(tx, { projectId, commentId, body: input.body, target, actor }, added)
    return reload(tx, projectId, commentId)
  })
  return toCommentDto(row, { userId: actor.userId, canModerate })
}

/** Author or moderator. Soft delete: the tombstone keeps its place in the thread. */
export async function deleteComment(
  projectId: string,
  commentId: string,
  actor: Actor,
  canModerate = false,
  now: Date = new Date()
): Promise<void> {
  await withTransaction(async (tx) => {
    const current = await loadLiveComment(tx, projectId, commentId)
    if (current.authorId !== actor.userId && !canModerate) {
      throw new ForbiddenError("Only the author or a moderator can delete this comment")
    }
    await repo.softDeleteComment(tx, commentId, now)
  })
}

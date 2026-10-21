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
 * - Create / edit / delete publish a "comment" real-time event (after the
 *   commit; entity + comment ids only) so open threads and badges refresh.
 * - Bodies are translated JA⇔ID like other user text (entity "comment",
 *   field "body", lowest priority; mentions are kept verbatim by the
 *   translator). The DTO carries `i18n`; a delete purges the translation.
 */
import { resolveAssignees, type AssigneeCandidate } from "@/lib/assignees"
import type { EntityI18n } from "@/lib/translation/types"
import { commentExcerpt, resolveMentionUserIds } from "@/lib/mentions"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import type { Actor } from "@/services/_shared/actor"
import { LABEL_MAX, logActivity } from "@/services/_shared/activity"
import { toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ForbiddenError, NotFoundError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./comments.repository"
import { insertMirror } from "@/services/team-chat/team-chat.repository"
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
  /** Both-language body (`{}` for tombstones and untranslated comments). */
  i18n: EntityI18n
}

/** Pure: DB row → DTO for `viewer` (tombstones hide body, mentions and translations). */
export function toCommentDto(row: CommentRow, viewer: CommentViewer, i18n: EntityI18n = {}): CommentDto {
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
    i18n: deleted ? {} : i18n,
  }
}

/** Translations of the live comments among `rows` (one query). */
async function commentI18n(rows: readonly CommentRow[]): Promise<Map<string, EntityI18n>> {
  return getI18nFor("comment", rows.filter((r) => r.deletedAt === null).map((r) => r.id))
}

async function toDtoWithI18n(row: CommentRow, viewer: CommentViewer): Promise<CommentDto> {
  const map = await commentI18n([row])
  return toCommentDto(row, viewer, map.get(row.id))
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
  const i18n = await commentI18n(rows)
  return toPage(rows, query.limit, (row) => toCommentDto(row, viewer, i18n.get(row.id)))
}

/** `{ counts: { [entityId]: n } }` — live comments per requested id (0 when none). */
/**
 * Badge counts per item; with `viewerId` also the viewer's unread mention /
 * comment notifications per item (read anywhere — bell, top page, dashboard,
 * the thread itself — they disappear everywhere, as all read the same rows).
 */
export async function getCommentCounts(
  projectId: string,
  query: CommentCountsQuery,
  viewerId?: string,
): Promise<{ counts: Record<string, number>; unread: Record<string, number> }> {
  const [found, unread] = await Promise.all([
    repo.countComments(defaultDb, projectId, query.entityType, query.ids),
    viewerId ? repo.countUnreadForUser(defaultDb, viewerId, projectId, query.entityType, query.ids) : Promise.resolve(new Map<string, number>()),
  ])
  return {
    counts: Object.fromEntries(query.ids.map((id) => [id, found.get(id) ?? 0])),
    unread: Object.fromEntries(query.ids.filter((id) => (unread.get(id) ?? 0) > 0).map((id) => [id, unread.get(id) as number])),
  }
}

/** The viewer opened the thread: its mention / comment notifications are read. */
export async function markThreadRead(projectId: string, entityType: CommentEntityType, entityId: string, viewerId: string, now: Date = new Date()): Promise<{ updated: number }> {
  const { count } = await repo.markEntityNotificationsRead(defaultDb, viewerId, projectId, entityType, entityId, now)
  return { updated: count }
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

/** Open threads, badges and the team chat (mirrors) of the project refresh live; ids only. */
function publishCommentEvent(projectId: string, row: { entityType: string; entityId: string }, commentId: string, action: string, actor: Actor): void {
  publishAfterCommit({ type: "comment", projectId, entityType: row.entityType, entityId: row.entityId, subjectId: commentId, action, actorId: actor.userId })
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
  canModerate = false,
  /** mirror: false = the caller (a team chat reply) links the comment itself. */
  options: { mirror?: boolean } = {}
): Promise<CommentDto> {
  const { body } = await prepareText({ body: input.body }, actor.userId)
  const row = await withTransaction(async (tx) => {
    const members = await repo.findMentionCandidates(tx, projectId)
    const target = await loadTarget(tx, projectId, input.entityType, input.entityId, members)
    const mentionIds = resolveMentionUserIds(body, members, actor.userId)
    const { id } = await repo.createComment(tx, {
      projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      authorId: actor.userId,
      body,
    })
    await repo.replaceMentions(tx, id, mentionIds)
    // Every comment also appears in the project's team chat.
    if (options.mirror !== false) await insertMirror(tx, { projectId, authorId: actor.userId, commentId: id })
    await enqueueIn(tx, "comment", id, { body })
    await logActivity(tx, {
      projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: "comment",
      actor,
      // No excerpt: a later-deleted comment must not survive in the history.
      diff: { label: target.label ?? undefined, meta: { commentId: id } },
    })
    const ctx: NotifyContext = { projectId, commentId: id, body, target, actor }
    await notifyMentioned(tx, ctx, mentionIds)
    await notifyParticipants(tx, ctx, mentionIds)
    publishCommentEvent(projectId, input, id, "create", actor)
    return reload(tx, projectId, id)
  })
  return toDtoWithI18n(row, { userId: actor.userId, canModerate })
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
  const { body } = await prepareText({ body: input.body }, actor.userId)
  const row = await withTransaction(async (tx) => {
    const current = await loadLiveComment(tx, projectId, commentId)
    if (current.authorId !== actor.userId) throw new ForbiddenError("Only the author can edit this comment")
    if (current.body === body) return current
    const members = await repo.findMentionCandidates(tx, projectId)
    const target = await loadTarget(tx, projectId, current.entityType as CommentEntityType, current.entityId, members)
    const before = current.mentions.map((m) => m.user.id)
    const mentionIds = resolveMentionUserIds(body, members, actor.userId)
    await repo.updateCommentBody(tx, commentId, body, now)
    await repo.replaceMentions(tx, commentId, mentionIds)
    await enqueueIn(tx, "comment", commentId, { body })
    const added = mentionIds.filter((id) => !before.includes(id))
    await notifyMentioned(tx, { projectId, commentId, body, target, actor }, added)
    publishCommentEvent(projectId, current, commentId, "update", actor)
    return reload(tx, projectId, commentId)
  })
  return toDtoWithI18n(row, { userId: actor.userId, canModerate })
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
    // The tombstone never shows its body again: drop the translation too.
    await purgeIn(tx, { comment: [commentId] })
    publishCommentEvent(projectId, current, commentId, "delete", actor)
  })
}

/**
 * Project-wide team chat (チームチャット): chat messages plus the mirrors of
 * PBI / sprint-task / IceBox comments, @mentions, Teams-style quoted replies
 * (a reply to a mirrored comment is also posted to that comment's thread),
 * file attachments with size limits and per-user read state.
 */
import { deleteUploadedFile, saveUploadedFile } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"
import { commentExcerpt, resolveMentionUserIds } from "@/lib/mentions"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import { checkTeamChatFiles, TEAM_CHAT_BODY_MAX, TEAM_CHAT_MAX_FILE_BYTES, TEAM_CHAT_MAX_FILES } from "@/lib/team-chat-limits"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ForbiddenError, NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import { assertStorageQuota } from "@/services/attachments/storage-quota"
import { createComment } from "@/services/comments/comments.service"
import { findMentionCandidates } from "@/services/comments/comments.repository"
import type { CommentEntityType } from "@/services/comments/comments.schemas"
import { sourceIds, sourceLabelMap, toMessageDto, type TeamMessageDto, type Viewer } from "./team-chat.dto"
import * as repo from "./team-chat.repository"

const log = logger.child({ module: "team-chat" })

/** Messages per page. */
export const TEAM_CHAT_PAGE = 50
/** Never-read chats count the last week as unread. */
const FIRST_READ_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** How notifications name the chat (rendered as the entity label). */
export const TEAM_CHAT_LABEL = "チームチャット"

async function toDtos(db: Db, projectId: string, rows: readonly repo.MessageRow[], viewer: Viewer): Promise<TeamMessageDto[]> {
  // Chat messages are translated as team_message; mirrors show their comment's translation.
  const own = rows.filter((r) => r.body !== null).map((r) => r.id)
  const mirrored = rows.filter((r) => r.body === null && r.commentId).map((r) => r.commentId as string)
  const [labelRows, ownI18n, commentI18n] = await Promise.all([
    repo.findSourceLabels(db, projectId, sourceIds(rows)),
    getI18nFor("team_message", own),
    getI18nFor("comment", mirrored),
  ])
  const labels = sourceLabelMap(labelRows)
  return rows.map((r) => toMessageDto(r, viewer, labels, r.body !== null ? ownI18n.get(r.id) : commentI18n.get(r.commentId ?? "")))
}

export interface ListQuery {
  before?: Date
  after?: Date
  /** Only messages that concern the viewer (mentions / replies to them). */
  forMe?: boolean
}

/** Oldest first. `after` = new messages since a poll; otherwise the page before `before` (or the latest). */
export async function listMessages(projectId: string, viewer: Viewer, query: ListQuery = {}): Promise<{ items: TeamMessageDto[]; hasMore: boolean }> {
  const rows = await repo.findMessages(defaultDb, projectId, {
    before: query.before,
    after: query.after,
    take: TEAM_CHAT_PAGE + 1,
    onlyFor: query.forMe ? viewer.userId : undefined,
  })
  const hasMore = rows.length > TEAM_CHAT_PAGE
  const page = rows.slice(0, TEAM_CHAT_PAGE)
  const ordered = query.after ? page : [...page].reverse()
  return { items: await toDtos(defaultDb, projectId, ordered, viewer), hasMore }
}

export interface CreateMessageInput {
  body: string
  replyToId: string | null
  files: File[]
}

function assertFiles(files: readonly File[]): void {
  const rejection = checkTeamChatFiles(files)
  if (!rejection) return
  if (rejection.reason === "too_many") {
    throw new ValidationError(`添付は 1 回に ${TEAM_CHAT_MAX_FILES} 個までです`, {}, "TEAM_CHAT_TOO_MANY_FILES")
  }
  const mb = Math.round(TEAM_CHAT_MAX_FILE_BYTES / 1024 / 1024)
  const what = rejection.reason === "too_large" ? `「${rejection.name}」` : "添付ファイルの合計"
  throw new StatusError(413, `${what}が大きすぎます（1 ファイル ${mb}MB まで）。大きなファイルはリンクで共有してください`, {}, "TEAM_CHAT_FILE_TOO_LARGE")
}

/** Saves the files first (outside the transaction); deletes them again when anything fails. */
async function saveFiles(projectId: string, files: readonly File[]) {
  const saved: { fileName: string; originalName: string; fileSize: number; mimeType: string }[] = []
  try {
    for (const file of files) {
      const r = await saveUploadedFile(projectId, file)
      if (!r.ok) throw new StatusError(r.status, r.error, {}, r.code)
      saved.push({ fileName: r.fileName, originalName: r.originalName, fileSize: r.fileSize, mimeType: r.mimeType })
    }
    return saved
  } catch (err) {
    await Promise.all(saved.map((s) => deleteUploadedFile(projectId, s.fileName)))
    throw err
  }
}

/** The comment text a chat reply leaves in the source thread (files stay in the chat). */
export function threadBody(body: string, fileCount: number): string {
  const note = fileCount > 0 ? `📎 ${TEAM_CHAT_LABEL}に添付ファイル ${fileCount} 件` : ""
  return [body.trim(), note].filter(Boolean).join("\n\n")
}

/**
 * Post to the chat. A reply to a mirrored comment (PBI / sprint task /
 * IceBox) is also written to that comment's thread; the chat row then links
 * that comment (no second mirror). Mentioned members and the replied-to
 * author are notified.
 */
export async function createMessage(projectId: string, input: CreateMessageInput, actor: Actor, canModerate = false): Promise<TeamMessageDto> {
  // Same text handling as comments (e.g. 用語<<訳語>> glossary marks); the worker translates JA ⇄ ID.
  const body = (await prepareText({ body: input.body.trim() }, actor.userId)).body
  if (!body && input.files.length === 0) throw new ValidationError("メッセージを入力するか、ファイルを添付してください", {}, "TEAM_CHAT_EMPTY")
  if (body.length > TEAM_CHAT_BODY_MAX) throw new ValidationError("メッセージが長すぎます", {}, "TEAM_CHAT_TOO_LONG")
  assertFiles(input.files)
  const replyTo = input.replyToId ? await repo.findMessage(defaultDb, projectId, input.replyToId) : null
  if (input.replyToId && (!replyTo || replyTo.deletedAt)) throw new NotFoundError("返信先のメッセージがありません", {}, "TEAM_CHAT_MESSAGE_NOT_FOUND")
  if (input.files.length > 0) await assertStorageQuota(projectId, input.files.reduce((s, f) => s + f.size, 0))

  // Reply to a comment from the sprint / backlog / IceBox: post it there too.
  const source = replyTo?.comment && !replyTo.comment.deletedAt ? replyTo.comment : null
  const threadComment = source
    ? await createComment(
        projectId,
        { entityType: source.entityType as CommentEntityType, entityId: source.entityId, body: threadBody(body, input.files.length) },
        actor,
        canModerate,
        { mirror: false },
      ).catch((err: unknown) => {
        // The chat reply is still posted; the thread copy is best effort (e.g. the task was deleted meanwhile).
        log.warn("team chat reply not posted to the source thread", { projectId, commentId: source.id, error: err instanceof Error ? err.message : String(err) })
        return null
      })
    : null

  const files = await saveFiles(projectId, input.files)
  const id = await withTransaction(async (tx) => {
    const members = await findMentionCandidates(tx, projectId)
    const mentionIds = resolveMentionUserIds(body, members)
    const { id } = await repo.insertMessage(tx, { projectId, authorId: actor.userId, body, replyToId: replyTo?.id ?? null, commentId: threadComment?.id ?? null })
    await repo.insertMentions(tx, id, mentionIds)
    await repo.insertAttachments(tx, id, files)
    if (body) await enqueueIn(tx, "team_message", id, { body })
    await notifyChat(tx, { projectId, messageId: id, body, actor, mentionIds, replyAuthorId: replyTo?.authorId ?? null })
    publishChatEvent(projectId, id, "create", actor)
    return id
  }).catch(async (err: unknown) => {
    await Promise.all(files.map((f) => deleteUploadedFile(projectId, f.fileName)))
    throw err
  })
  const row = await repo.findMessage(defaultDb, projectId, id)
  if (!row) throw new NotFoundError()
  const [dto] = await toDtos(defaultDb, projectId, [row], { userId: actor.userId, canModerate })
  return dto
}

/** Open chats and the sidebar badges of the project refresh live (after the commit; ids only). */
function publishChatEvent(projectId: string, messageId: string, action: "create" | "delete", actor: Actor): void {
  publishAfterCommit({ type: "team-message", projectId, entityType: "team_message", entityId: messageId, action, actorId: actor.userId })
}

interface ChatNotice {
  projectId: string
  messageId: string
  body: string
  actor: Actor
  mentionIds: readonly string[]
  replyAuthorId: string | null
}

async function notifyChat(tx: Db, n: ChatNotice): Promise<void> {
  const payload = { entityLabel: TEAM_CHAT_LABEL, actorName: n.actor.userName, excerpt: commentExcerpt(n.body), entityType: "team_message", entityId: n.messageId }
  const base = { actorId: n.actor.userId, projectId: n.projectId, entityType: "team_message", entityId: n.messageId, payload }
  await notify(tx, { ...base, recipientIds: n.mentionIds, type: "mentioned" })
  if (n.replyAuthorId && !n.mentionIds.includes(n.replyAuthorId)) {
    await notify(tx, { ...base, recipientIds: [n.replyAuthorId], type: "comment" })
  }
}

/** Author or moderator; a mirrored comment is deleted in its own thread instead. */
export async function deleteMessage(projectId: string, messageId: string, actor: Actor, canModerate = false, now: Date = new Date()): Promise<void> {
  const row = await repo.findMessage(defaultDb, projectId, messageId)
  if (!row || row.deletedAt) throw new NotFoundError()
  if (row.body === null) throw new ValidationError("スプリントなどのコメントは元の画面で削除してください", {}, "TEAM_CHAT_MIRROR_READONLY")
  if (row.authorId !== actor.userId && !canModerate) throw new ForbiddenError("自分のメッセージだけ削除できます")
  // The files go with the message, so they stop counting against the storage quota.
  const files = await repo.findAttachmentFiles(defaultDb, messageId)
  await withTransaction(async (tx) => {
    await repo.softDeleteMessage(tx, messageId, now)
    await repo.deleteAttachmentRows(tx, messageId)
    // A deleted message never shows its text again: drop its translation too.
    await purgeIn(tx, { team_message: [messageId] })
    publishChatEvent(projectId, messageId, "delete", actor)
  })
  await Promise.all(files.map((f) => deleteUploadedFile(projectId, f.fileName)))
}

/** The stored file of an attachment (404 outside the project / deleted message). */
export async function getAttachment(projectId: string, attachmentId: string) {
  const a = await repo.findAttachment(defaultDb, projectId, attachmentId)
  if (!a) throw new NotFoundError()
  return a
}

export interface ChatSummary {
  unread: number
  /** Unread messages mentioning / replying to the viewer. */
  forYou: number
  /** ISO time the viewer last read the chat (null = never). */
  lastReadAt: string | null
}

export async function getChatSummary(userId: string, projectId: string, now: Date = new Date()): Promise<ChatSummary> {
  const read = await repo.findRead(defaultDb, userId, projectId)
  const since = read?.lastReadAt ?? new Date(now.getTime() - FIRST_READ_WINDOW_MS)
  const counts = await repo.countUnread(defaultDb, userId, projectId, since)
  return { ...counts, lastReadAt: read?.lastReadAt.toISOString() ?? null }
}

/** The viewer has seen everything up to now. */
export async function markChatRead(userId: string, projectId: string, now: Date = new Date()): Promise<{ lastReadAt: string }> {
  await repo.upsertRead(defaultDb, userId, projectId, now)
  // Mentions / replies in the chat count as read once the chat was seen (bell, top page, dashboard).
  await repo.markChatNotificationsRead(defaultDb, userId, projectId, now)
  return { lastReadAt: now.toISOString() }
}


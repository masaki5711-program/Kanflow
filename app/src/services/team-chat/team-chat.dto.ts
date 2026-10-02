/** Team chat message DTOs (pure mapping from repository rows). */
import { commentExcerpt } from "@/lib/mentions"
import type { EntityI18n } from "@/lib/translation/types"
import type { MessageRow } from "./team-chat.repository"

export type SourceType = "pbi" | "sprint_task" | "icebox"

export interface MessageSourceDto {
  entityType: SourceType
  entityId: string
  /** "#12 Login" / task name; null when the entity is gone. */
  label: string | null
  /** Sprint of a task (deep link) and its name. */
  sprintId?: string
  sprintName?: string
}

export interface TeamMessageDto {
  id: string
  author: { id: string; name: string } | null
  body: string
  createdAt: string
  editedAt: string | null
  mentions: { id: string; name: string }[]
  /** The viewer is mentioned (shown highlighted). */
  mentionsMe: boolean
  /** Someone else answered one of the viewer's messages (shown highlighted too). */
  repliesToMe: boolean
  attachments: { id: string; originalName: string; mimeType: string; fileSize: number }[]
  /** Set for a comment written on a PBI / sprint task / IceBox item. */
  source: MessageSourceDto | null
  replyTo: { id: string; authorName: string | null; excerpt: string; attachmentCount: number; deleted: boolean; source: Pick<MessageSourceDto, "entityType" | "entityId"> | null } | null
  /** A chat reply that was also posted to the source's comment thread. */
  postedToThread: boolean
  canDelete: boolean
  /** Both-language body (field "body"): the message's own translation, or its comment's for a mirror. */
  i18n: EntityI18n
  /** Which translation record "translate now" refreshes. */
  translation: { type: "team_message" | "comment"; id: string } | null
}

export interface SourceLabels {
  pbis: { id: string; displayId: number; initiative: string | null; userStory: string | null }[]
  tasks: { id: string; taskName: string | null; sprintId: string; sprint: { sprintName: string } }[]
  icebox: { id: string; displayId: number; request: string }[]
}

const firstLine = (s: string | null | undefined) => (s ?? "").trim().split(/\r?\n/, 1)[0].trim()

/** Pure: "#12 title" / task name per entity id. */
export function sourceLabelMap(labels: SourceLabels): Map<string, Omit<MessageSourceDto, "entityType" | "entityId">> {
  const out = new Map<string, Omit<MessageSourceDto, "entityType" | "entityId">>()
  for (const p of labels.pbis) out.set(p.id, { label: `#${p.displayId} ${firstLine(p.initiative || p.userStory)}`.trim() })
  for (const t of labels.tasks) out.set(t.id, { label: firstLine(t.taskName) || null, sprintId: t.sprintId, sprintName: t.sprint.sprintName })
  for (const i of labels.icebox) out.set(i.id, { label: `#${i.displayId} ${firstLine(i.request)}`.trim() })
  return out
}

/** Ids per entity type of the comments behind the rows (for one label lookup). */
export function sourceIds(rows: readonly MessageRow[]): { pbi: string[]; sprint_task: string[]; icebox: string[] } {
  const ids = { pbi: new Set<string>(), sprint_task: new Set<string>(), icebox: new Set<string>() }
  for (const r of rows) {
    const c = r.comment
    if (c && c.entityType in ids) ids[c.entityType as SourceType].add(c.entityId)
  }
  return { pbi: [...ids.pbi], sprint_task: [...ids.sprint_task], icebox: [...ids.icebox] }
}

export interface Viewer {
  userId: string
  canModerate: boolean
}

/** Pure: one row as the chat renders it. */
export function toMessageDto(
  row: MessageRow,
  viewer: Viewer,
  labels: ReadonlyMap<string, Omit<MessageSourceDto, "entityType" | "entityId">>,
  i18n: EntityI18n = {},
): TeamMessageDto {
  const c = row.comment
  const mirror = row.body === null && !!c
  const mentionUsers = mirror ? c.mentions.map((m) => m.user) : row.mentions.map((m) => m.user)
  const source: MessageSourceDto | null = c
    ? { entityType: c.entityType as SourceType, entityId: c.entityId, ...(labels.get(c.entityId) ?? { label: null }) }
    : null
  const r = row.replyTo
  const replyText = r ? (r.body ?? (r.comment && !r.comment.deletedAt ? r.comment.body : "")) : ""
  return {
    id: row.id,
    author: row.author,
    body: (mirror ? c.body : row.body) ?? "",
    createdAt: row.createdAt.toISOString(),
    editedAt: mirror && c.editedAt ? c.editedAt.toISOString() : null,
    mentions: mentionUsers,
    mentionsMe: mentionUsers.some((u) => u.id === viewer.userId),
    repliesToMe: !!r?.author && r.author.id === viewer.userId && row.authorId !== viewer.userId,
    attachments: row.attachments,
    source,
    replyTo: r
      ? {
          id: r.id,
          authorName: r.author?.name ?? null,
          excerpt: commentExcerpt(replyText),
          attachmentCount: r._count.attachments,
          deleted: !!r.deletedAt || (r.body === null && (!r.comment || !!r.comment.deletedAt)),
          source: r.comment ? { entityType: r.comment.entityType as SourceType, entityId: r.comment.entityId } : null,
        }
      : null,
    postedToThread: row.body !== null && !!row.commentId,
    canDelete: !mirror && (row.authorId === viewer.userId || viewer.canModerate),
    i18n,
    translation: mirror ? { type: "comment", id: c.id } : row.body ? { type: "team_message", id: row.id } : null,
  }
}

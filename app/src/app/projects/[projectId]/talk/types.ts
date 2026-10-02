import type { Translations } from "@/lib/i18n"

/** Client shape of a team chat message (mirrors services/team-chat/team-chat.dto.ts). */
export type SourceType = "pbi" | "sprint_task" | "icebox"

export interface MessageSource {
  entityType: SourceType
  entityId: string
  label: string | null
  sprintId?: string
  sprintName?: string
}

export interface TeamMessage {
  id: string
  author: { id: string; name: string } | null
  body: string
  createdAt: string
  editedAt: string | null
  mentions: { id: string; name: string }[]
  mentionsMe: boolean
  repliesToMe: boolean
  attachments: { id: string; originalName: string; mimeType: string; fileSize: number }[]
  source: MessageSource | null
  replyTo: { id: string; authorName: string | null; excerpt: string; attachmentCount: number; deleted: boolean; source: Pick<MessageSource, "entityType" | "entityId"> | null } | null
  postedToThread: boolean
  canDelete: boolean
  /** Both-language body (field "body"). */
  i18n?: import("@/lib/translation/types").EntityI18n
  translation?: { type: "team_message" | "comment"; id: string } | null
}

/** "タスク「X」" / "PBI #12 Login" for a message's source. */
export function sourceText(t: Translations, source: Pick<MessageSource, "entityType" | "label">): string {
  const label = source.label ?? "—"
  if (source.entityType === "pbi") return t.talkSourcePbi.replace("{label}", label)
  if (source.entityType === "sprint_task") return t.talkSourceTask.replace("{label}", label)
  return t.talkSourceIcebox.replace("{label}", label)
}

/** Deep link to the commented item, opening its comment thread. */
export function sourceHref(projectId: string, source: Pick<MessageSource, "entityType" | "entityId">): string {
  const p = `/projects/${encodeURIComponent(projectId)}`
  const id = encodeURIComponent(source.entityId)
  if (source.entityType === "pbi") return `${p}/backlog?pbi=${id}&tab=comments`
  if (source.entityType === "sprint_task") return `${p}/sprints?task=${id}&tab=comments`
  return `${p}/icebox?item=${id}&tab=comments`
}

export const isImage = (mime: string) => mime.startsWith("image/")

/** Index of the first unread message (by someone else, after the previous visit's read mark), or -1. */
export function firstUnreadIndex(messages: readonly TeamMessage[], readMark: string | null | undefined, selfId: string | null): number {
  if (readMark === undefined) return -1
  return messages.findIndex((m) => m.author?.id !== selfId && (readMark === null || m.createdAt > readMark))
}

import type { Db } from "@/services/_shared/db"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import type { ReactionEmoji, ReactionTargetType } from "./reactions.schemas"

/** Live comments of the project among `ids`. */
export function findLiveCommentIds(db: Db, projectId: string, ids: readonly string[]) {
  return db.comment.findMany({ where: { projectId, id: { in: [...ids] }, ...NOT_DELETED }, select: { id: true } })
}

/** Live chat messages of the project among `ids`; `commentId` is set on a mirror of a comment. */
export function findLiveTeamMessages(db: Db, projectId: string, ids: readonly string[]) {
  return db.teamMessage.findMany({ where: { projectId, id: { in: [...ids] }, deletedAt: null }, select: { id: true, commentId: true } })
}

/** Tasks of the project among `ids` (the completion comment hangs on the task row). */
export function findTaskIds(db: Db, projectId: string, ids: readonly string[]) {
  return db.sprintBacklogItem.findMany({ where: { id: { in: [...ids] }, sprint: { projectId }, ...LIVE_PBI }, select: { id: true } })
}

/** The chat message that mirrors a comment (null when it was never mirrored). */
export function findMirrorMessageId(db: Db, commentId: string) {
  return db.teamMessage.findFirst({ where: { commentId, deletedAt: null }, select: { id: true } })
}

/** Reactions of the given targets, oldest first. */
export function findReactions(db: Db, targetType: ReactionTargetType, targetIds: readonly string[]) {
  return db.reaction.findMany({
    where: { targetType, targetId: { in: [...targetIds] } },
    select: { targetId: true, emoji: true, userId: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  })
}

export function findReaction(db: Db, targetType: ReactionTargetType, targetId: string, userId: string, emoji: ReactionEmoji) {
  return db.reaction.findUnique({ where: { targetType_targetId_userId_emoji: { targetType, targetId, userId, emoji } }, select: { id: true } })
}

export function createReaction(db: Db, data: { projectId: string; targetType: ReactionTargetType; targetId: string; userId: string; emoji: ReactionEmoji }) {
  return db.reaction.create({ data, select: { id: true } })
}

export function deleteReaction(db: Db, id: string) {
  return db.reaction.deleteMany({ where: { id } })
}

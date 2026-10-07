/**
 * Emoji reactions on team-chat messages, comments and the completion comment
 * of a sprint task.
 *
 * - One fixed palette (REACTION_EMOJIS); one row per (target, user, emoji), so
 *   a click toggles the viewer's own reaction.
 * - A team-chat mirror of a comment has no reactions of its own: it is
 *   redirected to the comment, so the chat and the comment thread show the
 *   same reactions.
 * - A toggle publishes a "reaction" real-time event (after the commit; ids
 *   only) for the target, the chat message that mirrors a comment and the
 *   comment a mirror stands for, so every open view refetches.
 */
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { isUniqueViolation, NotFoundError } from "@/services/_shared/errors"
import * as repo from "./reactions.repository"
import { REACTION_EMOJIS, type ReactionsQuery, type ReactionSummary, type ReactionTargetType, type ToggleReactionInput } from "./reactions.schemas"

export type { ReactionSummary }

/** Names listed per emoji (the count still covers everybody). */
export const REACTION_USERS_MAX = 10

interface Target {
  type: ReactionTargetType
  id: string
}

interface ReactionRow {
  targetId: string
  emoji: string
  userId: string
  user: { name: string | null } | null
}

/** Pure: reaction rows of ONE target → summaries in palette order. */
export function summarize(rows: readonly Pick<ReactionRow, "emoji" | "userId" | "user">[], viewerId: string): ReactionSummary[] {
  const out: ReactionSummary[] = []
  for (const emoji of REACTION_EMOJIS) {
    const own = rows.filter((r) => r.emoji === emoji)
    if (own.length === 0) continue
    out.push({
      emoji,
      count: own.length,
      mine: own.some((r) => r.userId === viewerId),
      users: own.slice(0, REACTION_USERS_MAX).map((r) => r.user?.name ?? "—"),
    })
  }
  return out
}

/** Requested id → the target that really holds its reactions (absent = not found in this project). */
async function resolveTargets(db: Db, projectId: string, type: ReactionTargetType, ids: readonly string[]): Promise<Map<string, Target>> {
  const out = new Map<string, Target>()
  if (type === "team_message") {
    for (const m of await repo.findLiveTeamMessages(db, projectId, ids)) {
      out.set(m.id, m.commentId ? { type: "comment", id: m.commentId } : { type: "team_message", id: m.id })
    }
    return out
  }
  const rows = type === "comment" ? await repo.findLiveCommentIds(db, projectId, ids) : await repo.findTaskIds(db, projectId, ids)
  for (const r of rows) out.set(r.id, { type, id: r.id })
  return out
}

/** Reactions of many targets at once: every requested id is a key (unknown ids → empty list). */
export async function getReactions(projectId: string, query: ReactionsQuery, viewerId: string): Promise<Record<string, ReactionSummary[]>> {
  const targets = await resolveTargets(defaultDb, projectId, query.targetType, query.ids)
  const byType = new Map<ReactionTargetType, string[]>()
  for (const t of targets.values()) byType.set(t.type, [...(byType.get(t.type) ?? []), t.id])
  const rows = (
    await Promise.all([...byType].map(async ([type, ids]) => (await repo.findReactions(defaultDb, type, ids)).map((r) => ({ ...r, type }))))
  ).flat()
  return Object.fromEntries(
    query.ids.map((id) => {
      const target = targets.get(id)
      const own = target ? rows.filter((r) => r.type === target.type && r.targetId === target.id) : []
      return [id, summarize(own, viewerId)]
    }),
  )
}

export interface ToggleResult {
  /** true = the reaction was added, false = it was taken back. */
  active: boolean
  reactions: ReactionSummary[]
}

/** Put the viewer's reaction on the target, or take it back when it is already there. */
export async function toggleReaction(projectId: string, input: ToggleReactionInput, actor: Actor): Promise<ToggleResult> {
  const target = (await resolveTargets(defaultDb, projectId, input.targetType, [input.targetId])).get(input.targetId)
  if (!target) throw new NotFoundError("Reaction target not found")

  const active = await withTransaction(async (tx) => {
    const existing = await repo.findReaction(tx, target.type, target.id, actor.userId, input.emoji)
    if (existing) {
      await repo.deleteReaction(tx, existing.id)
      return false
    }
    try {
      await repo.createReaction(tx, { projectId, targetType: target.type, targetId: target.id, userId: actor.userId, emoji: input.emoji })
    } catch (err) {
      // A double click raced us: the reaction is there, which is what was asked for.
      if (!isUniqueViolation(err)) throw err
    }
    return true
  })

  await publishReactionEvents(projectId, input, target, actor.userId)
  return { active, reactions: summarize(await repo.findReactions(defaultDb, target.type, [target.id]), actor.userId) }
}

/** Every view that can show this target: as requested, as stored, and its chat mirror. */
async function publishReactionEvents(projectId: string, input: ToggleReactionInput, target: Target, actorId: string): Promise<void> {
  const views = new Map<string, Target>([[`${target.type}:${target.id}`, target]])
  views.set(`${input.targetType}:${input.targetId}`, { type: input.targetType, id: input.targetId })
  if (target.type === "comment") {
    const mirror = await repo.findMirrorMessageId(defaultDb, target.id)
    if (mirror) views.set(`team_message:${mirror.id}`, { type: "team_message", id: mirror.id })
  }
  for (const v of views.values()) {
    publishAfterCommit({ type: "reaction", projectId, entityType: v.type, entityId: v.id, action: "toggle", actorId })
  }
}

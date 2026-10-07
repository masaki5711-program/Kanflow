import { REACTION_EMOJIS, type ReactionEmoji, type ReactionSummary } from "@/services/reactions/reactions.schemas"

/**
 * Pure: the reaction list as it will look once the viewer's click on `emoji`
 * has been applied (shown at once; the server's answer replaces it).
 * Palette order is kept; the list is never mutated.
 */
export function applyToggle(reactions: readonly ReactionSummary[], emoji: ReactionEmoji): ReactionSummary[] {
  const current = reactions.find((r) => r.emoji === emoji)
  if (!current) {
    const added: ReactionSummary = { emoji, count: 1, mine: true, users: [] }
    return [...reactions, added].sort((a, b) => REACTION_EMOJIS.indexOf(a.emoji) - REACTION_EMOJIS.indexOf(b.emoji))
  }
  if (!current.mine) return reactions.map((r) => (r === current ? { ...r, count: r.count + 1, mine: true } : r))
  if (current.count <= 1) return reactions.filter((r) => r !== current)
  return reactions.map((r) => (r === current ? { ...r, count: r.count - 1, mine: false } : r))
}

/** Tooltip of a chip: who reacted, and how many more there are. */
export function reactionTitle(summary: ReactionSummary, moreLabel: (count: number) => string): string {
  const rest = summary.count - summary.users.length
  return rest > 0 ? `${summary.users.join(", ")}, ${moreLabel(rest)}` : summary.users.join(", ")
}

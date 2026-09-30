/**
 * Sprint-task assignee helpers (P2: userId normalization).
 *
 * The legacy `SprintBacklogItem.assignee` column holds display names joined by
 * commas ("Taro Yamada, Hanako"). Hand-typed values may also use full-width
 * commas (，), the ideographic comma (、), semicolons or line breaks. These
 * pure helpers split such strings and resolve each name to a User id; they are
 * shared by the one-off backfill (scripts/migrate-assignees.ts) and by later
 * code that still has to accept the legacy string.
 *
 * Whitespace is NOT a separator: names such as "Taro Yamada" contain spaces.
 */

/** Separators accepted between names in a legacy assignee string. */
const NAME_SEPARATORS = /[,，、;；\r\n]+/

export interface AssigneeCandidate {
  id: string
  name: string
}

/** How a name was matched; later tiers are only tried when earlier ones find nothing. */
export type MatchTier = "exact" | "case_insensitive" | "no_spaces"

export type NameMatch =
  | { status: "matched"; userId: string; tier: MatchTier }
  | { status: "ambiguous"; tier: MatchTier; userIds: string[] }
  | { status: "unmatched" }

/** Trim and collapse inner whitespace (incl. full-width spaces) to one ASCII space. */
function tidy(value: string): string {
  return value.replace(/[\s　]+/g, " ").trim()
}

/** Unicode-compatibility fold (full-width Latin → ASCII) + case fold. */
function foldCase(value: string): string {
  return tidy(value.normalize("NFKC")).toLowerCase()
}

/** Case-folded with every whitespace removed ("Yamada Taro" ≡ "YamadaTaro"). */
function foldNoSpaces(value: string): string {
  return foldCase(value).replace(/\s+/g, "")
}

/**
 * Split a legacy assignee string into distinct, trimmed names (first
 * occurrence wins, original spelling kept). null / blank → [].
 */
export function splitAssigneeNames(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of raw.split(NAME_SEPARATORS)) {
    const name = tidy(part)
    if (!name) continue
    const key = foldNoSpaces(name)
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/** A task as far as its assignee names are concerned (TaskAssignee relation optional). */
export interface AssigneeNameSource {
  assignee: string | null
  assignees?: ReadonlyArray<{ user: { name: string } }>
}

/**
 * Display names of a task's assignees: the normalized TaskAssignee users
 * when there are any, else the legacy comma-separated string (tasks not
 * backfilled yet, or a query that did not load the relation).
 */
export function assigneeNamesOf(task: AssigneeNameSource): string[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees.map((a) => a.user.name)
  return splitAssigneeNames(task.assignee)
}

const TIERS: ReadonlyArray<{ tier: MatchTier; key: (value: string) => string }> = [
  { tier: "exact", key: tidy },
  { tier: "case_insensitive", key: foldCase },
  { tier: "no_spaces", key: foldNoSpaces },
]

/**
 * Resolve one name against candidates: exact (after trimming), then
 * case-insensitive (NFKC), then ignoring all spaces. The first tier with any
 * hit decides; more than one distinct user at that tier is "ambiguous" and is
 * never guessed.
 */
export function matchAssigneeName(name: string, candidates: readonly AssigneeCandidate[]): NameMatch {
  for (const { tier, key } of TIERS) {
    const wanted = key(name)
    if (!wanted) return { status: "unmatched" }
    const ids = [...new Set(candidates.filter((c) => key(c.name) === wanted).map((c) => c.id))]
    if (ids.length === 1) return { status: "matched", userId: ids[0], tier }
    if (ids.length > 1) return { status: "ambiguous", tier, userIds: ids }
  }
  return { status: "unmatched" }
}

export interface UnresolvedName {
  name: string
  reason: "unmatched" | "ambiguous" | "non_member"
  /** Users that matched but were not used (ambiguous hits, or non-members). */
  candidateIds: string[]
}

export interface AssigneeResolution {
  /** Distinct user ids, in the order the names appeared. */
  userIds: string[]
  unresolved: UnresolvedName[]
}

/**
 * Resolve a whole legacy assignee string.
 *
 * `scope` is the preferred candidate set (the project's members). When a name
 * cannot be resolved inside the scope but does match in `fallback` (all
 * users), it is reported as `non_member` rather than silently assigned.
 */
export function resolveAssignees(
  raw: string | null | undefined,
  scope: readonly AssigneeCandidate[],
  fallback: readonly AssigneeCandidate[] = [],
): AssigneeResolution {
  const userIds: string[] = []
  const unresolved: UnresolvedName[] = []
  for (const name of splitAssigneeNames(raw)) {
    const match = matchAssigneeName(name, scope)
    if (match.status === "matched") {
      if (!userIds.includes(match.userId)) userIds.push(match.userId)
      continue
    }
    if (match.status === "ambiguous") {
      unresolved.push({ name, reason: "ambiguous", candidateIds: match.userIds })
      continue
    }
    const outside = fallback.length > 0 ? matchAssigneeName(name, fallback) : ({ status: "unmatched" } as const)
    if (outside.status === "unmatched") unresolved.push({ name, reason: "unmatched", candidateIds: [] })
    else {
      const ids = outside.status === "matched" ? [outside.userId] : outside.userIds
      unresolved.push({ name, reason: "non_member", candidateIds: ids })
    }
  }
  return { userIds, unresolved }
}

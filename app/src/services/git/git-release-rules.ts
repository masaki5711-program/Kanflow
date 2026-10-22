import { allMergeRequestsMerged } from "./git-links"

/**
 * Pure rules that tie the release tab's versions to Git tags: name matching,
 * which tag precedes which, and whether a planned PBI really made it into a release.
 */
export interface TagInfo {
  tag: string
  name: string | null
  description: string | null
  url: string
  releasedAt: Date
}

/** "v1.4.0", " V1.4.0 " and "1.4.0" are the same version. */
export function normalizeVersion(v: string): string {
  return v.trim().toLowerCase().replace(/^v(?=\d)/, "")
}

/** The tag of a version (matched by tag or release title); the newest when several repositories tag it. */
export function findTag(version: string, tags: readonly TagInfo[]): TagInfo | undefined {
  const key = normalizeVersion(version)
  if (!key) return undefined
  return tags
    .filter((t) => normalizeVersion(t.tag) === key || (t.name !== null && normalizeVersion(t.name) === key))
    .sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime())[0]
}

/** The tag released just before `current` (another version's tag), or undefined for the first one. */
export function previousTag(current: TagInfo, tags: readonly TagInfo[]): TagInfo | undefined {
  return tags
    .filter((t) => normalizeVersion(t.tag) !== normalizeVersion(current.tag) && t.releasedAt.getTime() < current.releasedAt.getTime())
    .sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime())[0]
}

export interface MrState {
  state: string | null
  mergedAt: Date | null
}

/**
 * "merged": the PBI has merged MRs and none is still open — and, when the
 * version is already tagged, none landed after the tag (it is not in that release).
 * "pending": everything else (no MR yet, still open, or merged after the tag).
 */
export function pbiReadiness(mrs: readonly MrState[], tagAt: Date | null): "merged" | "pending" {
  if (!allMergeRequestsMerged(mrs.map((m) => m.state))) return "pending"
  if (tagAt && mrs.some((m) => m.state === "merged" && m.mergedAt && m.mergedAt.getTime() > tagAt.getTime())) return "pending"
  return "merged"
}

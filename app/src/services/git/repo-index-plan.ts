import { createHash } from "node:crypto"
import type { GitLabDiffEntry, GitLabTreeEntry } from "@/lib/git/gitlab-client"

/**
 * What one index pass has to do (pure): the list of file changes between
 * the indexed commit and the target commit, sorted by path so a pass cut
 * short by its time budget can resume after the last finished path.
 */

export type FileChange = { op: "upsert"; path: string } | { op: "delete"; path: string }

/** A compare touching more files than this is cheaper as a full re-index. */
export const MAX_COMPARE_FILES = 1000
/** Files considered per repository (tree entries beyond this are ignored). */
export const MAX_INDEX_FILES = 3000

const byPath = (a: FileChange, b: FileChange) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** One change per path (the last one wins), sorted by path. */
function dedupe(changes: readonly FileChange[]): FileChange[] {
  const map = new Map<string, FileChange>()
  for (const c of changes) map.set(c.path, c)
  return [...map.values()].sort(byPath)
}

/**
 * Incremental plan from a GitLab compare. Removed files and the old side of
 * renames are deleted; added / modified files are (re)indexed when the rules
 * include them, otherwise their old chunks are deleted (e.g. a file renamed
 * into an excluded folder). Null = do a full pass instead (too many changes).
 */
export function planFromCompare(diffs: readonly GitLabDiffEntry[], include: (path: string) => boolean): FileChange[] | null {
  if (diffs.length >= MAX_COMPARE_FILES) return null
  const changes: FileChange[] = []
  for (const d of diffs) {
    if (d.deleted_file) {
      changes.push({ op: "delete", path: d.old_path })
      continue
    }
    if (d.renamed_file && d.old_path !== d.new_path) changes.push({ op: "delete", path: d.old_path })
    changes.push(include(d.new_path) ? { op: "upsert", path: d.new_path } : { op: "delete", path: d.new_path })
  }
  return dedupe(changes)
}

/**
 * Full plan from the tree at the target commit: every included file whose
 * stored blob id differs is (re)indexed, every stored file that is gone or
 * no longer included is deleted. Unchanged files cost nothing.
 */
export function planFromTree(
  tree: readonly GitLabTreeEntry[],
  stored: ReadonlyMap<string, string>,
  include: (path: string) => boolean,
): { changes: FileChange[]; truncated: boolean } {
  const blobs = tree.filter((e) => e.type === "blob" && include(e.path))
  const kept = blobs.slice(0, MAX_INDEX_FILES)
  const wanted = new Set(kept.map((b) => b.path))
  const upserts: FileChange[] = kept.filter((b) => stored.get(b.path) !== b.id).map((b) => ({ op: "upsert", path: b.path }))
  const deletes: FileChange[] = [...stored.keys()].filter((p) => !wanted.has(p)).map((path) => ({ op: "delete", path }))
  return { changes: dedupe([...upserts, ...deletes]), truncated: blobs.length > kept.length }
}

/** The changes still to do after `cursor` (the last finished path of an interrupted pass). */
export function remainingAfter(changes: readonly FileChange[], cursor: string | null): FileChange[] {
  return cursor === null ? [...changes] : changes.filter((c) => c.path > cursor)
}

/** Git's blob id of some content (sha1 of "blob <size>\0<bytes>"), equal to GitLab's tree entry id. */
export function gitBlobSha(data: Buffer): string {
  return createHash("sha1").update(`blob ${data.byteLength}\0`).update(data).digest("hex")
}

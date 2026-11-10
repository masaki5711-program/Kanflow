import { GitStationError, isObjectId } from "./gitstation-client"

/**
 * Shapes of GitStation's repository browse answers (`/api/v1/projects/{id}/repository/<route>`,
 * GitStation main 059cc34: crates/forge-web/src/routes/browse.rs, history.rs). Pure: each parser
 * returns a typed value or throws `invalid_response`. A malformed entry fails the whole answer —
 * dropping it would read as "this file is gone" and delete its passages.
 */

export type StationRevType = "branch" | "tag" | "commit"

/** The ref an answer was computed at; `commit` is the commit it resolved to for THIS request. */
export interface StationRev {
  type: StationRevType
  name: string
  commit: string
}

export interface StationRefs {
  /** null = empty repository (no default branch born). */
  defaultBranch: string | null
  refs: { name: string; fullName: string | null; commit: string | null }[]
  truncated: boolean
}

export type StationEntryType = "tree" | "blob" | "symlink" | "submodule"

export interface StationTreeEntry {
  name: string
  /** Full path from the repository root. */
  path: string
  type: StationEntryType
  oid: string
  size: number | null
}

export interface StationTree {
  ref: StationRev
  entries: StationTreeEntry[]
  /** The level had more entries than GitStation lists. */
  truncated: boolean
}

export interface StationBlob {
  ref: StationRev
  type: "blob" | "symlink"
  oid: string
  size: number
  binary: boolean
  /** null when binary (a NUL byte or not UTF-8). */
  content: string | null
  /** Over GitStation's blob cap (1 MiB): `content` is not the whole file. */
  truncated: boolean
}

export type StationDiffStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed"

export interface StationDiffFile {
  status: StationDiffStatus
  oldPath: string | null
  newPath: string | null
}

export interface StationCompare {
  to: StationRev
  files: StationDiffFile[]
  /** More files than GitStation lists, or a patch left out by size (the two cannot be told apart). */
  truncated: boolean
  /** Files of confidential documents were removed from `files` (FG-AUTH-0021). */
  withheld: boolean
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0
const bool = (v: unknown): v is boolean => typeof v === "boolean"
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0

function invalid(what: string): never {
  throw new GitStationError("invalid_response", `GitStation ${what} has an unexpected shape`)
}

const REV_TYPES: readonly string[] = ["branch", "tag", "commit"]
const ENTRY_TYPES: readonly string[] = ["tree", "blob", "symlink", "submodule"]
const DIFF_STATUSES: readonly string[] = ["added", "modified", "deleted", "renamed", "copied", "type_changed"]

function parseRev(v: unknown, what: string): StationRev {
  if (!isObject(v) || !nonEmpty(v.type) || !REV_TYPES.includes(v.type) || !nonEmpty(v.name) || !isObjectId(v.commit)) invalid(what)
  return { type: v.type as StationRevType, name: v.name, commit: v.commit }
}

export function parseRefs(body: unknown): StationRefs {
  if (!isObject(body) || !Array.isArray(body.refs) || !bool(body.truncated)) invalid("refs")
  if (body.default_branch !== null && !nonEmpty(body.default_branch)) invalid("refs")
  const refs = body.refs.map((r) => {
    if (!isObject(r) || !nonEmpty(r.name)) invalid("refs")
    if (r.commit !== null && r.commit !== undefined && !isObjectId(r.commit)) invalid("refs")
    return { name: r.name, fullName: nonEmpty(r.full_name) ? r.full_name : null, commit: isObjectId(r.commit) ? r.commit : null }
  })
  return { defaultBranch: body.default_branch, refs, truncated: body.truncated }
}

export function parseTree(body: unknown): StationTree {
  if (!isObject(body) || !Array.isArray(body.entries) || !bool(body.truncated)) invalid("tree")
  const ref = parseRev(body.ref, "tree")
  const entries = body.entries.map((e) => {
    if (!isObject(e) || !nonEmpty(e.name) || !nonEmpty(e.path) || !nonEmpty(e.type) || !ENTRY_TYPES.includes(e.type) || !isObjectId(e.oid)) invalid("tree")
    if (e.size !== null && e.size !== undefined && !count(e.size)) invalid("tree")
    return { name: e.name, path: e.path, type: e.type as StationEntryType, oid: e.oid, size: count(e.size) ? e.size : null }
  })
  return { ref, entries, truncated: body.truncated }
}

export function parseBlob(body: unknown): StationBlob {
  if (!isObject(body) || (body.type !== "blob" && body.type !== "symlink") || !isObjectId(body.oid) || !count(body.size) || !bool(body.binary) || !bool(body.truncated)) invalid("blob")
  if (body.content !== null && typeof body.content !== "string") invalid("blob")
  return { ref: parseRev(body.ref, "blob"), type: body.type, oid: body.oid, size: body.size, binary: body.binary, content: body.content, truncated: body.truncated }
}

export function parseCompare(body: unknown): StationCompare {
  if (!isObject(body) || !isObject(body.diff) || !Array.isArray(body.diff.files) || !bool(body.diff.truncated)) invalid("compare")
  const files = body.diff.files.map((f) => {
    if (!isObject(f) || !nonEmpty(f.status) || !DIFF_STATUSES.includes(f.status)) invalid("compare")
    const oldPath = f.old_path === null || f.old_path === undefined ? null : nonEmpty(f.old_path) ? f.old_path : invalid("compare")
    const newPath = f.new_path === null || f.new_path === undefined ? null : nonEmpty(f.new_path) ? f.new_path : invalid("compare")
    if (oldPath === null && newPath === null) invalid("compare")
    return { status: f.status as StationDiffStatus, oldPath, newPath }
  })
  const withheld = body.diff.withheld !== undefined && body.diff.withheld !== null
  return { to: parseRev(body.to, "compare"), files, truncated: body.diff.truncated, withheld }
}

/** GitStation error codes of a document withheld from an agent (blob: 0021; whole-copy routes: 0022). */
export const CONFIDENTIAL_CODES: readonly string[] = ["FG-AUTH-0021", "FG-AUTH-0022"]

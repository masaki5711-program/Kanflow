/**
 * 触る範囲 (touched scope, W4) of a work claim — pure rules, no I/O.
 *
 * A claim may declare the files it will touch: `path` entries (a file or a
 * directory, relative POSIX path from the repository root) and `module` entries
 * (a crate / package / directory name, e.g. "forge-auth" or "services/dev-work").
 * Declaring never blocks anyone: overlaps are WARNINGS shown to the AI session
 * (declare_scope) and on the board / PBI screens.
 *
 * - Normalization: trimmed, "\" → "/", "./" and "." segments dropped, repeated "/"
 *   collapsed, trailing "/" and a trailing "/**" or "/*" dropped (a directory covers
 *   everything below it). Refused: empty, absolute ("/x", "C:/x", "~/x", "\\server"),
 *   ".." segments, other glob characters (* ? [ ]), control characters, more than
 *   SCOPE_VALUE_MAX characters. Case is kept and compared exactly (repositories are
 *   case-sensitive), so dedupe and comparison happen here, never in the database
 *   (MySQL's collation is case-insensitive, PostgreSQL's is not).
 * - Overlap of two entries:
 *   path × path   — equal, or one is a prefix of the other on a "/" boundary
 *                   ("app/src" covers "app/src/x.ts", not "app/srcx");
 *   module × module — equal;
 *   module × path — the module's segments appear, in order and contiguous, among the
 *                   path's directory segments ("forge-auth" covers
 *                   "crates/forge-auth/src/lib.rs").
 * - Claims compared: other ACTIVE claims of the project (not released, heartbeat
 *   within the stale window); the claim itself never. Another claim of the same user
 *   (another session) counts: two sessions on the same files collide as well.
 */
import { isClaimActive } from "./dev-work.rules"

export const SCOPE_KINDS = ["path", "module"] as const
export type ScopeKind = (typeof SCOPE_KINDS)[number]

export interface ScopeEntry {
  kind: ScopeKind
  value: string
}

/** Longest stored value (work_claim_scope.value VARCHAR(300)). */
export const SCOPE_VALUE_MAX = 300
/** Entries per claim. */
export const SCOPE_ENTRIES_MAX = 200

export type ScopeRefusal = "empty" | "absolute" | "parent" | "pattern" | "control" | "too_long"

export type NormalizedValue = { ok: true; value: string } | { ok: false; reason: ScopeRefusal }

const CONTROL = /[\x00-\x1f\x7f]/
const PATTERN = /[*?[\]]/

export function normalizeScopeValue(_kind: ScopeKind, raw: string): NormalizedValue {
  if (CONTROL.test(raw.trim())) return { ok: false, reason: "control" }
  let v = raw.trim().replace(/\\/g, "/")
  if (v === "") return { ok: false, reason: "empty" }
  if (v.startsWith("/") || v.startsWith("~") || /^[A-Za-z]:/.test(v)) return { ok: false, reason: "absolute" }
  v = v.replace(/\/(\*\*|\*)$/, "")
  const segments = v.split("/").filter((s) => s !== "" && s !== ".")
  if (segments.some((s) => s === "..")) return { ok: false, reason: "parent" }
  if (segments.some((s) => PATTERN.test(s))) return { ok: false, reason: "pattern" }
  const value = segments.join("/")
  if (value === "") return { ok: false, reason: "empty" }
  if (value.length > SCOPE_VALUE_MAX) return { ok: false, reason: "too_long" }
  return { ok: true, value }
}

const codeUnitOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Modules first, then paths; values by UTF-16 code unit (the same on every database). */
export function sortScope(entries: readonly ScopeEntry[]): ScopeEntry[] {
  return [...entries].sort((a, b) => (a.kind === b.kind ? codeUnitOrder(a.value, b.value) : a.kind === "module" ? -1 : 1))
}

export type NormalizedScope =
  | { ok: true; scope: ScopeEntry[] }
  | { ok: false; index: number; reason: ScopeRefusal | "too_many" }

/** The whole declared set: each entry normalized, exact duplicates dropped, at most SCOPE_ENTRIES_MAX, sorted. */
export function normalizeScope(entries: readonly ScopeEntry[]): NormalizedScope {
  const seen = new Map<string, ScopeEntry>()
  for (const [index, entry] of entries.entries()) {
    const n = normalizeScopeValue(entry.kind, entry.value)
    if (!n.ok) return { ok: false, index, reason: n.reason }
    const key = `${entry.kind}\n${n.value}`
    if (seen.has(key)) continue
    if (seen.size >= SCOPE_ENTRIES_MAX) return { ok: false, index, reason: "too_many" }
    seen.set(key, { kind: entry.kind, value: n.value })
  }
  return { ok: true, scope: sortScope([...seen.values()]) }
}

const isUnder = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`)

/** The module's segments appear contiguously among the path's segments. */
function pathInModule(path: string, module: string): boolean {
  const ps = path.split("/")
  const ms = module.split("/")
  for (let i = 0; i + ms.length <= ps.length; i++) {
    if (ms.every((m, j) => ps[i + j] === m)) return true
  }
  return false
}

/** The area two entries share (the more specific value), or null when they do not overlap. */
export function entriesOverlap(a: ScopeEntry, b: ScopeEntry): string | null {
  if (a.kind === "path" && b.kind === "path") {
    if (isUnder(b.value, a.value)) return b.value
    if (isUnder(a.value, b.value)) return a.value
    return null
  }
  if (a.kind === "module" && b.kind === "module") return a.value === b.value ? a.value : null
  const [module, path] = a.kind === "module" ? [a.value, b.value] : [b.value, a.value]
  return pathInModule(path, module) ? path : null
}

/** A claim as the overlap check needs it. */
export interface ScopedClaim {
  id: string
  heartbeatAt: Date
  releasedAt: Date | null
  scope: readonly ScopeEntry[]
}

export interface ScopeOverlap<T extends ScopedClaim> {
  claim: T
  /** The shared areas, deduplicated, sorted. */
  paths: string[]
}

/** Other active claims whose scope shares an area with `scope` (input order kept). Never `claimId` itself. */
export function scopeOverlaps<T extends ScopedClaim>(
  claimId: string,
  scope: readonly ScopeEntry[],
  others: readonly T[],
  now: Date,
  staleHours: number,
): ScopeOverlap<T>[] {
  if (scope.length === 0) return []
  const out: ScopeOverlap<T>[] = []
  for (const other of others) {
    if (other.id === claimId || !isClaimActive(other, now, staleHours)) continue
    const shared = new Set<string>()
    for (const mine of scope) {
      for (const theirs of other.scope) {
        const area = entriesOverlap(mine, theirs)
        if (area !== null) shared.add(area)
      }
    }
    if (shared.size > 0) out.push({ claim: other, paths: [...shared].sort(codeUnitOrder) })
  }
  return out
}

/**
 * Changed files (as the source reported them) that no entry of `scope` covers, in input
 * order without duplicates. A changed path that does not normalize (absolute, "..") is
 * outside by definition — reported, never silently dropped.
 */
export function outsideScope(changedPaths: readonly string[], scope: readonly ScopeEntry[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of changedPaths) {
    if (seen.has(raw)) continue
    seen.add(raw)
    const n = normalizeScopeValue("path", raw)
    if (!(n.ok && scope.some((entry) => coversPath(entry, n.value)))) out.push(raw)
  }
  return out
}

/** An entry covers a changed FILE when the file lies under it (a deeper declared path does not cover its parent). */
function coversPath(entry: ScopeEntry, path: string): boolean {
  return entry.kind === "path" ? isUnder(path, entry.value) : pathInModule(path, entry.value)
}

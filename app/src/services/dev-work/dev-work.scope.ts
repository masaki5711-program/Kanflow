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
 *   ".." segments, glob characters (* ?; "[" and "]" are ordinary path characters —
 *   e.g. Next.js "[projectId]" directories), control characters, more than
 *   SCOPE_VALUE_MAX characters. Case is kept and compared exactly (repositories are
 *   case-sensitive), so dedupe and comparison happen here, never in the database
 *   (MySQL's collation is case-insensitive, PostgreSQL's is not).
 * - Overlap of two entries:
 *   path × path   — equal, or one is a prefix of the other on a "/" boundary
 *                   ("app/src" covers "app/src/x.ts", not "app/srcx");
 *   module × module — equal;
 *   module × path — the module's segments appear, in order and contiguous, among the
 *                   path's segments ("forge-auth" covers "crates/forge-auth/src/lib.rs"),
 *                   OR the path is a directory containing a KNOWN location of the module
 *                   ("crates" vs "forge-auth" when some declared path of the project's
 *                   claims shows the module at "crates/forge-auth"). A module's location
 *                   is only known from such paths (Kanflow does not read the repository
 *                   tree here); without one, a directory and a module do not overlap.
 * - Changed files of a merge request (the Git sync) are NOT run through the declaration
 *   rules: they are compared literally (trimmed, "\" → "/"); only an absolute path or one
 *   with a ".." segment is unusable (reported separately, never counted as outside).
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
/** Glob characters refused in a declaration ("[" / "]" are allowed: valid, common path characters). */
const PATTERN = /[*?]/

export function normalizeScopeValue(_kind: ScopeKind, raw: string): NormalizedValue {
  if (CONTROL.test(raw.trim())) return { ok: false, reason: "control" }
  let v = raw.trim().replace(/\\/g, "/")
  if (v === "") return { ok: false, reason: "empty" }
  if (v.startsWith("/") || v.startsWith("~") || /^[A-Za-z]:/.test(v)) return { ok: false, reason: "absolute" }
  v = v.replace(/\/(\*\*|\*)$/, "")
  const segments = v.split("/").filter((s) => s !== "" && s !== ".")
  if (segments.some((s) => s === "..")) return { ok: false, reason: "parent" }
  if (segments.some((seg) => PATTERN.test(seg))) return { ok: false, reason: "pattern" }
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

/** Where the module's segments start in the path's segments, or -1. */
function moduleIndex(path: string, module: string): number {
  const ps = path.split("/")
  const ms = module.split("/")
  for (let i = 0; i + ms.length <= ps.length; i++) {
    if (ms.every((m, j) => ps[i + j] === m)) return i
  }
  return -1
}

/** The module's segments appear contiguously among the path's segments. */
const pathInModule = (path: string, module: string) => moduleIndex(path, module) >= 0

/** Known directories of modules (module value → its directories), learned from declared paths. */
export type ModuleLocations = ReadonlyMap<string, readonly string[]>

/** Pure: every directory where a declared path shows one of the modules ("crates/forge-auth/src" → forge-auth at "crates/forge-auth"). */
export function moduleLocations(entries: Iterable<ScopeEntry>): ModuleLocations {
  const all = [...entries]
  const modules = new Set(all.filter((e) => e.kind === "module").map((e) => e.value))
  const out = new Map<string, Set<string>>()
  for (const e of all) {
    if (e.kind !== "path") continue
    for (const m of modules) {
      const i = moduleIndex(e.value, m)
      if (i < 0) continue
      const dir = e.value.split("/").slice(0, i + m.split("/").length).join("/")
      out.set(m, (out.get(m) ?? new Set()).add(dir))
    }
  }
  return new Map([...out].map(([m, dirs]) => [m, [...dirs]]))
}

/**
 * The area two entries share (the more specific value), or null when they do not overlap.
 * `locations`: known module directories (moduleLocations) — lets a directory that CONTAINS a
 * module overlap it ("crates" × module "forge-auth" → "crates/forge-auth").
 */
export function entriesOverlap(a: ScopeEntry, b: ScopeEntry, locations: ModuleLocations = new Map()): string | null {
  if (a.kind === "path" && b.kind === "path") {
    if (isUnder(b.value, a.value)) return b.value
    if (isUnder(a.value, b.value)) return a.value
    return null
  }
  if (a.kind === "module" && b.kind === "module") return a.value === b.value ? a.value : null
  const [module, path] = a.kind === "module" ? [a.value, b.value] : [b.value, a.value]
  if (pathInModule(path, module)) return path
  const inside = (locations.get(module) ?? []).filter((dir) => isUnder(dir, path))
  return inside.length > 0 ? [...inside].sort(codeUnitOrder)[0] : null
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

/**
 * Other active claims whose scope shares an area with `scope` (input order kept). Never
 * `claimId` itself. Module locations are learned from every declared path in `scope` and `others`.
 */
export function scopeOverlaps<T extends ScopedClaim>(
  claimId: string,
  scope: readonly ScopeEntry[],
  others: readonly T[],
  now: Date,
  staleHours: number,
): ScopeOverlap<T>[] {
  if (scope.length === 0) return []
  const active = others.filter((o) => o.id !== claimId && isClaimActive(o, now, staleHours))
  const locations = moduleLocations([...scope, ...active.flatMap((o) => o.scope)])
  const out: ScopeOverlap<T>[] = []
  for (const other of active) {
    const shared = new Set<string>()
    for (const mine of scope) {
      for (const theirs of other.scope) {
        const area = entriesOverlap(mine, theirs, locations)
        if (area !== null) shared.add(area)
      }
    }
    if (shared.size > 0) out.push({ claim: other, paths: [...shared].sort(codeUnitOrder) })
  }
  return out
}

/**
 * A changed file as the source reported it, for a literal comparison: trimmed, "\" → "/".
 * null when unusable (absolute, a ".." segment, empty) — never rewritten otherwise: "[id]",
 * "*", "~", long names and the like are real file names.
 */
export function changedFilePath(raw: string): string | null {
  const v = raw.trim().replace(/\\/g, "/")
  if (v === "" || v.startsWith("/") || /^[A-Za-z]:\//.test(v)) return null
  if (v.split("/").some((seg) => seg === "..")) return null
  return v
}

export interface OutsideScope {
  /** Changed files no entry covers (input order, deduplicated). */
  outside: string[]
  /** Changed paths that could not be compared (absolute / ".."): skipped, for the caller to log. */
  unusable: string[]
}

/** Changed files (as the source reported them) that no entry of `scope` covers. */
export function outsideScope(changedPaths: readonly string[], scope: readonly ScopeEntry[]): OutsideScope {
  const outside: string[] = []
  const unusable: string[] = []
  const seen = new Set<string>()
  for (const raw of changedPaths) {
    if (seen.has(raw)) continue
    seen.add(raw)
    const path = changedFilePath(raw)
    if (path === null) unusable.push(raw)
    else if (!scope.some((entry) => coversPath(entry, path))) outside.push(raw)
  }
  return { outside, unusable }
}

/** An entry covers a changed FILE when the file lies under it (a deeper declared path does not cover its parent). */
function coversPath(entry: ScopeEntry, path: string): boolean {
  return entry.kind === "path" ? isUnder(path, entry.value) : pathInModule(path, entry.value)
}

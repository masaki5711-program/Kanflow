/**
 * Where a loaded base schedule came from (plan 12 E0): `sourceRef`, the template `lineage` and the canonical
 * JSON its hash is taken over. Pure and client-safe (zod only; the sha256 itself is computed server side).
 *
 * sourceRef — what the caller supplies, validated, stored verbatim. Two forms:
 *   gitstation:<repo>@<tag>:<path>   a `schedule.yml` in a GitStation repository at a tag / ref
 *                                    (repo: segments of [A-Za-z0-9._-] joined by "/"; tag: [A-Za-z0-9._/+-];
 *                                    path: [A-Za-z0-9._/-]; no "." / ".." / empty segment in repo, tag or path)
 *   template:<id>@v<n>               a Kanflow plan template at version n
 * At most SOURCE_REF_MAX characters. Anything else is refused (400) rather than stored half-understood.
 *
 * lineage — the name of a template family that stays the same across its versions, so loads of v1 and v4
 * of one template can be compared. The caller may give it (free text, trimmed, 1..LINEAGE_MAX, no control
 * characters); otherwise `defaultLineage` derives it:
 *   gitstation:<repo>@<tag>:<path>  → gitstation:<repo>:<path>   (the tag dropped)
 *   template:<id>@v<n>              → template:<id>              (the version dropped)
 *   no sourceRef, a card name given → name:<NFKC, trimmed, whitespace collapsed, lower case>
 *   nothing                         → schedule:<first 16 hex of the schedule hash>   (identical content only)
 */
import { z } from "zod"

export const SOURCE_REF_MAX = 300
export const LINEAGE_MAX = 200

const SEG = "[A-Za-z0-9._-]+"
const GITSTATION_REF = new RegExp(`^gitstation:(${SEG}(?:/${SEG})*)@([A-Za-z0-9._/+-]+):([A-Za-z0-9._/-]+)$`)
const TEMPLATE_REF = /^template:([A-Za-z0-9_-]{1,64})@v(\d{1,9})$/

function parseSourceRef(ref: string): { kind: "gitstation"; repo: string; path: string } | { kind: "template"; id: string } | null {
  const git = GITSTATION_REF.exec(ref)
  if (git) {
    const [, repo, tag, path] = git
    // No "." / ".." segment and no empty segment anywhere: the parts name a repository, a ref and a file, never a walk.
    const bad = (value: string) => value.split("/").some((part) => part === "." || part === ".." || part === "")
    if (bad(repo) || bad(tag) || bad(path)) return null
    return { kind: "gitstation", repo, path }
  }
  const tpl = TEMPLATE_REF.exec(ref)
  if (tpl) return { kind: "template", id: tpl[1] }
  return null
}

export const sourceRefSchema = z
  .string()
  .min(1)
  .max(SOURCE_REF_MAX)
  .refine((ref) => parseSourceRef(ref) !== null, "sourceRef: gitstation:<repo>@<tag>:<path> or template:<id>@v<n>")

const CONTROL = /[\u0000-\u001f\u007f]/
const CONTROL_ALL = new RegExp(CONTROL.source, "g")

export const lineageSchema = z
  .string()
  .trim()
  .min(1)
  .max(LINEAGE_MAX)
  .refine((value) => !CONTROL.test(value), "lineage: no control characters")

/** The lineage implied by a sourceRef or, without one, by the caller's own schedule name; null when neither says. */
export function lineageFromSource(input: { sourceRef?: string | null; name?: string | null }): string | null {
  const parsed = input.sourceRef ? parseSourceRef(input.sourceRef) : null
  if (parsed?.kind === "gitstation") return `gitstation:${parsed.repo}:${parsed.path}`.slice(0, LINEAGE_MAX)
  if (parsed?.kind === "template") return `template:${parsed.id}`
  const name = (input.name ?? "").normalize("NFKC").replace(CONTROL_ALL, "").replace(/\s+/g, " ").trim().toLowerCase()
  return name ? `name:${name}`.slice(0, LINEAGE_MAX) : null
}

/** The lineage to store when the caller gave none (see the module comment for the rules). */
export function defaultLineage(input: { sourceRef?: string | null; name?: string | null; scheduleHash: string }): string {
  return lineageFromSource(input) ?? `schedule:${input.scheduleHash.slice(0, 16)}`
}

/** JSON with object keys sorted at every level (array order kept): equal content, equal text, equal hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

import { describe, expect, it } from "vitest"
import {
  changedFilePath,
  entriesOverlap,
  moduleLocations,
  normalizeScope,
  normalizeScopeValue,
  outsideScope,
  scopeOverlaps,
  SCOPE_ENTRIES_MAX,
  SCOPE_VALUE_MAX,
  sortScope,
  type ScopeEntry,
} from "../dev-work.scope"

/** 触る範囲 (W4) — pure rules: normalization, overlap, outside-scope detection. Synthetic paths only. */

const p = (value: string): ScopeEntry => ({ kind: "path", value })
const mod = (value: string): ScopeEntry => ({ kind: "module", value })

describe("normalizeScopeValue", () => {
  it.each([
    ["  app/src/x.ts  ", "app/src/x.ts"],
    ["./app/src", "app/src"],
    ["app//src///x", "app/src/x"],
    ["app/./src/", "app/src"],
    ["app\\src\\x.ts", "app/src/x.ts"],
    ["app/src/**", "app/src"],
    ["app/src/*", "app/src"],
    ["App/Src/X.ts", "App/Src/X.ts"],
    ["docs/日本語.md", "docs/日本語.md"],
    // "[" / "]" are ordinary path characters (Next.js dynamic routes)
    ["app/src/app/projects/[projectId]/page.tsx", "app/src/app/projects/[projectId]/page.tsx"],
    ["app/src/app/api/v1/projects/[projectId]/dev/**", "app/src/app/api/v1/projects/[projectId]/dev"],
  ])("path %j → %j (relative POSIX, case kept)", (raw, want) => {
    expect(normalizeScopeValue("path", raw)).toEqual({ ok: true, value: want })
  })

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["./", "empty"],
    ["/etc/passwd", "absolute"],
    ["\\\\server\\share\\x", "absolute"],
    ["C:\\Users\\someone\\x.ts", "absolute"],
    ["c:/x", "absolute"],
    ["~/x", "absolute"],
    ["app/../secret", "parent"],
    ["..", "parent"],
    ["app/src/*.ts", "pattern"],
    ["app/x?.ts", "pattern"],
    ["app/\u0000x", "control"],
    ["app/\nx", "control"],
    [`a/${"x".repeat(SCOPE_VALUE_MAX)}`, "too_long"],
  ])("path %j is refused (%s)", (raw, reason) => {
    expect(normalizeScopeValue("path", raw)).toEqual({ ok: false, reason })
  })

  it("modules follow the same rules (crate / directory names, may be nested)", () => {
    expect(normalizeScopeValue("module", " forge-auth ")).toEqual({ ok: true, value: "forge-auth" })
    expect(normalizeScopeValue("module", "services/dev-work/")).toEqual({ ok: true, value: "services/dev-work" })
    expect(normalizeScopeValue("module", "../x")).toEqual({ ok: false, reason: "parent" })
    expect(normalizeScopeValue("module", "/abs")).toEqual({ ok: false, reason: "absolute" })
  })
})

describe("normalizeScope", () => {
  it("normalizes, drops exact duplicates (case-sensitive), sorts deterministically", () => {
    const r = normalizeScope([p("b/x.ts"), p("./b/x.ts"), p("B/x.ts"), mod("core"), p("a")])
    expect(r).toEqual({ ok: true, scope: [mod("core"), p("B/x.ts"), p("a"), p("b/x.ts")] })
  })

  it("names the first bad entry by its index", () => {
    expect(normalizeScope([p("ok"), p("../no")])).toEqual({ ok: false, index: 1, reason: "parent" })
  })

  it(`more than ${SCOPE_ENTRIES_MAX} distinct entries is too large; duplicates do not count`, () => {
    const many = Array.from({ length: SCOPE_ENTRIES_MAX }, (_, i) => p(`f/${i}`))
    expect(normalizeScope([...many, p("f/0")]).ok).toBe(true)
    expect(normalizeScope([...many, p("f/extra")])).toEqual({ ok: false, index: SCOPE_ENTRIES_MAX, reason: "too_many" })
  })

  it("an empty set is allowed (clears the declaration)", () => {
    expect(normalizeScope([])).toEqual({ ok: true, scope: [] })
  })
})

describe("entriesOverlap (the shared area, or null)", () => {
  it.each([
    // path vs path: prefix on a directory boundary only
    [p("app/src"), p("app/src"), "app/src"],
    [p("app/src"), p("app/src/x.ts"), "app/src/x.ts"],
    [p("app/src/x.ts"), p("app/src"), "app/src/x.ts"],
    [p("app/src"), p("app/srcx/y.ts"), null],
    [p("app/src2"), p("app/src"), null],
    [p("app/src/a.ts"), p("app/src/b.ts"), null],
    [p("App/src"), p("app/src"), null],
    // module vs module: equality
    [mod("forge-auth"), mod("forge-auth"), "forge-auth"],
    [mod("forge-auth"), mod("forge-authz"), null],
    [mod("services/dev-work"), mod("dev-work"), null],
    // module vs path: the path lies under a directory named like the module
    [mod("forge-auth"), p("crates/forge-auth/src/lib.rs"), "crates/forge-auth/src/lib.rs"],
    [p("crates/forge-auth"), mod("forge-auth"), "crates/forge-auth"],
    [mod("forge-auth"), p("crates/forge-authz/src/lib.rs"), null],
    [mod("services/dev-work"), p("app/src/services/dev-work/a.ts"), "app/src/services/dev-work/a.ts"],
    [mod("services/dev-work"), p("app/src/services/x/dev-work/a.ts"), null],
    [mod("forge-auth"), p("crates"), null],
  ] as const)("%j × %j → %j", (a, b, want) => {
    expect(entriesOverlap(a, b)).toBe(want)
  })
})

describe("scopeOverlaps", () => {
  const NOW = new Date("2026-11-01T12:00:00.000Z")
  const HOUR = 3_600_000
  const claim = (id: string, scope: ScopeEntry[], over: Partial<{ heartbeatAt: Date; releasedAt: Date | null; userId: string }> = {}) => ({
    id,
    userId: over.userId ?? `u-${id}`,
    heartbeatAt: over.heartbeatAt ?? new Date(NOW.getTime() - HOUR),
    releasedAt: over.releasedAt ?? null,
    scope,
  })

  it("lists every other active claim that shares an area, with the shared paths (deduplicated, sorted)", () => {
    const mine = [p("app/src/services"), mod("forge-auth")]
    const others = [
      claim("a", [p("app/src/services/dev-work/x.ts"), p("app/src/services/git")]),
      claim("b", [p("docs")]),
      claim("c", [p("crates/forge-auth/src"), mod("forge-auth")]),
    ]
    const r = scopeOverlaps("mine", mine, others, NOW, 4)
    expect(r.map((o) => [o.claim.id, o.paths])).toEqual([
      ["a", ["app/src/services/dev-work/x.ts", "app/src/services/git"]],
      ["c", ["crates/forge-auth/src", "forge-auth"]],
    ])
  })

  it("ignores the caller's own claim, stale claims and released claims", () => {
    const mine = [p("app")]
    const others = [
      claim("mine", [p("app")]),
      claim("stale", [p("app")], { heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) }),
      claim("released", [p("app")], { releasedAt: NOW }),
      claim("live", [p("app/x")]),
    ]
    expect(scopeOverlaps("mine", mine, others, NOW, 4).map((o) => o.claim.id)).toEqual(["live"])
  })

  it("another claim of the same user still counts (two sessions on the same files collide too)", () => {
    const others = [claim("other-session", [p("app")], { userId: "u-mine" })]
    expect(scopeOverlaps("mine", [p("app/a.ts")], others, NOW, 4)).toHaveLength(1)
  })

  it("nothing for an empty scope", () => {
    expect(scopeOverlaps("mine", [], [claim("a", [p("app")])], NOW, 4)).toEqual([])
  })
})

describe("outsideScope (changed files of a merge request vs a declared scope)", () => {
  const scope = [p("app/src/services/dev-work"), p("docs/api-v1.md"), mod("forge-auth"), p("app/src/app/projects/[projectId]")]

  it("keeps only the files no entry covers, in input order, deduplicated", () => {
    const changed = [
      "app/src/services/dev-work/a.ts",
      "docs/api-v1.md",
      "crates/forge-auth/src/lib.rs",
      "app/src/services/git/git-sync.ts",
      "docs/api-v1.md.bak",
      "app/src/services/git/git-sync.ts",
    ]
    expect(outsideScope(changed, scope)).toEqual({ outside: ["app/src/services/git/git-sync.ts", "docs/api-v1.md.bak"], unusable: [] })
  })

  it("real file names with [ ] * ? ~, control-free long names are compared literally (not refused like a declaration)", () => {
    const long = `app/src/app/projects/[projectId]/${"n".repeat(400)}.tsx`
    const changed = [
      "app/src/app/projects/[projectId]/sprints/page.tsx",
      "app/src/app/projects/[projectId]/page.tsx",
      long,
      "app/src/app/projects/[slug]/page.tsx",
      "~weird/file?.ts",
      "docs/a*b.md",
    ]
    expect(outsideScope(changed, scope)).toEqual({ outside: ["app/src/app/projects/[slug]/page.tsx", "~weird/file?.ts", "docs/a*b.md"], unusable: [] })
  })

  it("an absolute or '..' changed path is unusable: reported separately, never counted as outside", () => {
    expect(outsideScope(["/etc/passwd", "../x", "C:/x", "docs/api-v1.md"], scope)).toEqual({ outside: [], unusable: ["/etc/passwd", "../x", "C:/x"] })
  })

  it("an empty scope covers nothing", () => {
    expect(outsideScope(["a"], [])).toEqual({ outside: ["a"], unusable: [] })
  })

  it("changedFilePath: trim and \\ → / only", () => {
    expect(changedFilePath("  app\\x [1].ts ")).toBe("app/x [1].ts")
    expect(changedFilePath("a/../b")).toBeNull()
    expect(changedFilePath("")).toBeNull()
  })
})

describe("module × directory containing it (symmetric where the location is known)", () => {
  it("moduleLocations learns a module's directory from declared paths", () => {
    const locs = moduleLocations([mod("forge-auth"), mod("services/dev-work"), p("crates/forge-auth/src/lib.rs"), p("app/src/services/dev-work/a.ts"), p("docs")])
    expect(locs.get("forge-auth")).toEqual(["crates/forge-auth"])
    expect(locs.get("services/dev-work")).toEqual(["app/src/services/dev-work"])
  })

  it("a directory containing a known module location overlaps the module; unknown location → no overlap", () => {
    const locs = moduleLocations([mod("forge-auth"), p("crates/forge-auth/src")])
    expect(entriesOverlap(p("crates"), mod("forge-auth"), locs)).toBe("crates/forge-auth")
    expect(entriesOverlap(mod("forge-auth"), p("crates"), locs)).toBe("crates/forge-auth")
    expect(entriesOverlap(p("app"), mod("forge-auth"), locs)).toBeNull()
    expect(entriesOverlap(p("crates"), mod("forge-auth"))).toBeNull()
  })

  it("scopeOverlaps uses locations from every claim: 'app/src' vs a module whose path another claim declared", () => {
    const NOW = new Date("2026-11-01T12:00:00.000Z")
    const fresh = new Date(NOW.getTime() - 3_600_000)
    const others = [
      { id: "a", heartbeatAt: fresh, releasedAt: null, scope: [mod("services/dev-work")] },
      { id: "b", heartbeatAt: fresh, releasedAt: null, scope: [p("app/src/services/dev-work/x.ts")] },
    ]
    const r = scopeOverlaps("mine", [p("app/src")], others, NOW, 4)
    expect(r.map((o) => [o.claim.id, o.paths])).toEqual([
      ["a", ["app/src/services/dev-work"]],
      ["b", ["app/src/services/dev-work/x.ts"]],
    ])
  })
})

describe("sortScope", () => {
  it("modules first, then paths, by code unit order (same on every database)", () => {
    expect(sortScope([p("b"), p("B"), mod("z"), p("a")])).toEqual([mod("z"), p("B"), p("a"), p("b")])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const queryRaw = vi.fn()
const chunkFindMany = vi.fn()
const chunkFindFirst = vi.fn()
const repoFindMany = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    repoChunk: { findMany: (...a: unknown[]) => chunkFindMany(...a), findFirst: (...a: unknown[]) => chunkFindFirst(...a) },
    gitRepository: { findMany: (...a: unknown[]) => repoFindMany(...a) },
  },
}))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const search = await import("../repo-search")
const { resetFulltextFallback } = await import("@/lib/fulltext/fallback")

const REPO = { id: "r1", name: "仕様書", webUrl: "https://gitlab.example/g/spec", ref: "abc123", indexedFiles: 3, indexedAt: null }
const row = (o: Partial<{ id: string; path: string; heading: string | null; anchor: string | null; content: string; score: number }>) => ({
  id: o.id ?? "c1",
  repositoryId: "r1",
  path: o.path ?? "docs/a.md",
  heading: o.heading ?? null,
  anchor: o.anchor ?? null,
  content: o.content ?? "OEE text",
  score: o.score ?? 1,
})

beforeEach(() => {
  vi.clearAllMocks()
  resetFulltextFallback()
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe("extractKeywords", () => {
  it("splits a Japanese question at particles and script changes", () => {
    expect(search.extractKeywords("OEEとOLEの計算方法の違いは？")).toEqual(["OEE", "OLE", "計算方法"])
  })

  it("drops stopwords (en / id), operators and 1-character terms", () => {
    expect(search.extractKeywords("Bagaimana perhitungan OEE/OLE dari PFE ke PFS?")).toEqual(["perhitungan", "OEE", "OLE", "PFE", "PFS"])
    expect(search.extractKeywords('+what -is "the" Tier-2 a')).toEqual(["Tier"])
  })

  it("caps the number of keywords", () => {
    expect(search.extractKeywords("aa bb cc dd ee ff gg hh ii jj")).toHaveLength(8)
  })
})

describe("blobUrl / snippetOf / pickRepos", () => {
  it("links the file at the indexed commit with the anchor, path segments encoded", () => {
    expect(search.blobUrl(REPO, "10-pfs/06 oee (draft).md", "11-oee")).toBe("https://gitlab.example/g/spec/-/blob/abc123/10-pfs/06%20oee%20%28draft%29.md#11-oee")
    expect(search.blobUrl(REPO, "a.md", null)).toBe("https://gitlab.example/g/spec/-/blob/abc123/a.md")
  })

  it("cuts a snippet around the first keyword", () => {
    const text = `${"x".repeat(500)} OEE formula ${"y".repeat(800)}`
    const s = search.snippetOf(text, ["oee"])
    expect(s.startsWith("…")).toBe(true)
    expect(s).toContain("OEE formula")
    expect(s.length).toBeLessThanOrEqual(452)
  })

  it("picks repositories by id or name part, all when no hint", () => {
    const repos = [REPO, { ...REPO, id: "r2", name: "API" }]
    expect(search.pickRepos(repos, undefined)).toHaveLength(2)
    expect(search.pickRepos(repos, "api").map((r) => r.id)).toEqual(["r2"])
    expect(search.pickRepos(repos, "r1").map((r) => r.id)).toEqual(["r1"])
    expect(search.pickRepos(repos, "nothing")).toEqual([])
  })
})

describe("rerank", () => {
  it("prefers passages whose heading / path name the topic", () => {
    const rows = [row({ id: "mention", path: "90-governance/register.md", score: 10 }), row({ id: "about", path: "10-pfs/06-oee-ole.md", heading: "OEE / OLE calculation", score: 6 })]
    expect(search.rerank(rows, ["OEE", "OLE"]).map((r) => r.id)).toEqual(["about", "mention"])
  })
})

describe("searchRepoDocs", () => {
  it("is scoped to the project and the given repositories, at most two passages per file", async () => {
    queryRaw.mockResolvedValueOnce([1, 2, 3, 4, 5, 6].map((i) => row({ id: `c${i}`, path: i <= 3 ? "a.md" : `f${i}.md`, score: 10 - i })))
    const hits = await search.searchRepoDocs("p1", [REPO], "OEE")
    const sql = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string }
    expect(sql.sql).toContain("MATCH(`path`, `heading`, `content`)")
    expect(sql.values).toEqual(expect.arrayContaining(["p1", "r1", "+OEE*"]))
    expect(hits.map((h) => h.path)).toEqual(["a.md", "a.md", "f4.md", "f5.md"])
    expect(hits[0]).toMatchObject({ repository: "仕様書", url: "https://gitlab.example/g/spec/-/blob/abc123/a.md" })
  })

  it("fills up with any-keyword matches when all keywords find too little", async () => {
    queryRaw.mockResolvedValueOnce([row({ id: "strict" })]).mockResolvedValueOnce([row({ id: "strict" }), row({ id: "loose", path: "b.md" })])
    const hits = await search.searchRepoDocs("p1", [REPO], "OEE OLE")
    expect((queryRaw.mock.calls[1][0] as { values: unknown[] }).values).toContain("OEE* OLE*")
    expect(hits).toHaveLength(2)
  })

  it("falls back to LIKE (ranked by keyword hits) when FULLTEXT is off", async () => {
    vi.stubEnv("SEARCH_FULLTEXT", "off")
    chunkFindMany.mockResolvedValue([row({ id: "one", content: "OEE only" }), row({ id: "both", path: "b.md", content: "OEE and OLE" })])
    const hits = await search.searchRepoDocs("p1", [REPO], "OEE OLE")
    expect(queryRaw).not.toHaveBeenCalled()
    expect(chunkFindMany.mock.calls[0][0].where).toMatchObject({ projectId: "p1", repositoryId: { in: ["r1"] } })
    expect(hits.map((h) => h.path)).toEqual(["b.md", "docs/a.md"])
  })

  it("returns nothing without repositories or keywords (no query)", async () => {
    expect(await search.searchRepoDocs("p1", [], "OEE")).toEqual([])
    expect(await search.searchRepoDocs("p1", [REPO], "の ?")).toEqual([])
    expect(queryRaw).not.toHaveBeenCalled()
  })
})

describe("listKnowledgeRepos / readRepoFile", () => {
  it("lists only switched-on repositories of a live project with the integration on", async () => {
    repoFindMany.mockResolvedValue([{ id: "r1", name: "仕様書", webUrl: REPO.webUrl, indexedSha: null, indexTargetSha: "t", indexedFiles: 0, indexedAt: null }])
    const repos = await search.listKnowledgeRepos("p1")
    expect(repoFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", aiKnowledge: true, project: { deletedAt: null, gitIntegration: { enabled: true, provider: { in: ["gitlab"] } } } })
    expect(repos[0].ref).toBe("t")
  })

  it("reads the passages of an exact path inside the given repositories only", async () => {
    chunkFindFirst.mockResolvedValue({ repositoryId: "r1", path: "docs/a.md" })
    chunkFindMany.mockResolvedValue([{ heading: "A", anchor: "a", content: "x" }])
    const found = await search.readRepoFile("p1", [REPO], "./docs/a.md")
    expect(chunkFindFirst.mock.calls[0][0].where).toEqual({ projectId: "p1", repositoryId: { in: ["r1"] }, path: "docs/a.md" })
    expect(found).toMatchObject({ path: "docs/a.md", passages: [{ heading: "A" }] })
  })

  it("resolves a unique partial path, or lists candidates", async () => {
    chunkFindFirst.mockResolvedValue(null)
    chunkFindMany.mockResolvedValueOnce([{ repositoryId: "r1", path: "10-pfs/06-oee.md" }]).mockResolvedValueOnce([{ heading: null, anchor: null, content: "x" }])
    expect(await search.readRepoFile("p1", [REPO], "06-oee.md")).toMatchObject({ path: "10-pfs/06-oee.md" })
    chunkFindMany.mockResolvedValueOnce([{ repositoryId: "r1", path: "a/x.md" }, { repositoryId: "r1", path: "b/x.md" }])
    expect(await search.readRepoFile("p1", [REPO], "x.md")).toEqual({ candidates: ["a/x.md", "b/x.md"] })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const listKnowledgeRepos = vi.fn()
const searchRepoDocs = vi.fn()
const readRepoFile = vi.fn()
vi.mock("@/services/git/repo-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/repo-search")>()
  return {
    ...actual,
    listKnowledgeRepos: (...a: unknown[]) => listKnowledgeRepos(...a),
    searchRepoDocs: (...a: unknown[]) => searchRepoDocs(...a),
    readRepoFile: (...a: unknown[]) => readRepoFile(...a),
  }
})
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { REPO_KNOWLEDGE_TOOL_DEFS, REPO_KNOWLEDGE_GUIDE, READ_MAX_CHARS, hasRepoKnowledge, repoKnowledgeHandlers } = await import("../repo-knowledge-tools")

const SPEC = { id: "r1", name: "仕様書", webUrl: "https://gitlab.example/g/spec", ref: "abc", indexedFiles: 3, indexedAt: null }
const API = { ...SPEC, id: "r2", name: "API" }
const call = (name: string, args: Record<string, unknown>, projectId = "p1") => repoKnowledgeHandlers[name]({ projectId, args, actor: undefined as never })

beforeEach(() => {
  vi.clearAllMocks()
  listKnowledgeRepos.mockResolvedValue([SPEC, API])
})

describe("definitions and guide", () => {
  it("defines the two tools with required arguments", () => {
    expect(REPO_KNOWLEDGE_TOOL_DEFS.map((d) => [d.function.name, d.function.parameters.required])).toEqual([
      ["search_repository_docs", ["query"]],
      ["read_repository_file", ["path"]],
    ])
  })

  it("tells the model to cite and to say when the documents are silent, in every language", () => {
    expect(REPO_KNOWLEDGE_GUIDE.ja).toContain("仕様書（リポジトリ）には記載がありません")
    expect(REPO_KNOWLEDGE_GUIDE.ja).toContain("出典")
    expect(REPO_KNOWLEDGE_GUIDE.en).toContain("Sources")
    expect(REPO_KNOWLEDGE_GUIDE.id).toContain("Sumber")
    // Short: it is added to every chat prompt of such a project.
    for (const text of Object.values(REPO_KNOWLEDGE_GUIDE)) expect(text.length).toBeLessThan(650)
  })

  it("hasRepoKnowledge follows the project's knowledge repositories", async () => {
    expect(await hasRepoKnowledge("p1")).toBe(true)
    listKnowledgeRepos.mockResolvedValue([])
    expect(await hasRepoKnowledge("p1")).toBe(false)
  })
})

describe("search_repository_docs", () => {
  it("searches the caller's project only and lists passages with their GitLab URL", async () => {
    searchRepoDocs.mockResolvedValue([{ repository: "仕様書", path: "10-pfs/06-oee.md", heading: "OEE > 1.1", url: "https://gitlab.example/x#11", snippet: "OEE = A × P × Q", score: 3 }])
    const out = await call("search_repository_docs", { query: "OEE" })
    expect(listKnowledgeRepos).toHaveBeenCalledWith("p1")
    expect(searchRepoDocs).toHaveBeenCalledWith("p1", [SPEC, API], "OEE")
    expect(out).toContain("10-pfs/06-oee.md — OEE > 1.1")
    expect(out).toContain("url: https://gitlab.example/x#11")
  })

  it("narrows to a named repository and explains an unknown name", async () => {
    searchRepoDocs.mockResolvedValue([])
    await call("search_repository_docs", { query: "x y", repository: "api" })
    expect(searchRepoDocs.mock.calls[0][1]).toEqual([API])
    expect(await call("search_repository_docs", { query: "x", repository: "nope" })).toBe("No matching repository. Available: 仕様書, API")
  })

  it("says plainly when nothing matched (so the model does not guess)", async () => {
    searchRepoDocs.mockResolvedValue([])
    expect(await call("search_repository_docs", { query: "給与計算" })).toContain("the documents do not cover it")
  })

  it("refuses without a query and without any knowledge repository", async () => {
    expect(await call("search_repository_docs", {})).toBe("Error: query is required.")
    listKnowledgeRepos.mockResolvedValue([])
    expect(await call("search_repository_docs", { query: "x" })).toBe("No reference repository is set up for this project.")
    expect(searchRepoDocs).not.toHaveBeenCalled()
  })
})

describe("read_repository_file", () => {
  const passages = (n: number, size = 1000) =>
    Array.from({ length: n }, (_, i) => ({ heading: `Doc > ${i}. Part ${i}`, anchor: `${i}-part-${i}`, content: `${"z".repeat(size)} #${i}` }))

  it("returns the passages in order with section anchors and a table of contents", async () => {
    readRepoFile.mockResolvedValue({ repo: SPEC, path: "a.md", passages: passages(2, 10) })
    const out = await call("read_repository_file", { path: "a.md" })
    expect(readRepoFile).toHaveBeenCalledWith("p1", [SPEC, API], "a.md")
    expect(out).toContain("File: a.md (repository 仕様書)")
    expect(out).toContain("Sections: 0. Part 0 | 1. Part 1")
    expect(out.indexOf("#0")).toBeLessThan(out.indexOf("#1"))
    expect(out).toContain("https://gitlab.example/g/spec/-/blob/abc/a.md#1-part-1")
  })

  it("truncates long files and points to the section parameter", async () => {
    readRepoFile.mockResolvedValue({ repo: SPEC, path: "big.md", passages: passages(20) })
    const out = await call("read_repository_file", { path: "big.md" })
    expect(out.length).toBeLessThan(READ_MAX_CHARS + 2500)
    expect(out).toMatch(/truncated: \d+ more passages\. Call read_repository_file again with section=/)
  })

  it("reads only the sections whose heading contains `section`", async () => {
    readRepoFile.mockResolvedValue({ repo: SPEC, path: "a.md", passages: passages(5, 10) })
    const out = await call("read_repository_file", { path: "a.md", section: "part 3" })
    expect(out).toContain("#3")
    expect(out).not.toContain("z #2")
    expect(await call("read_repository_file", { path: "a.md", section: "nothing" })).toContain('No section heading contains "nothing"')
  })

  it("suggests candidates or the search tool when the path is unknown", async () => {
    readRepoFile.mockResolvedValue({ candidates: ["a/x.md", "b/x.md"] })
    expect(await call("read_repository_file", { path: "x.md" })).toContain("Did you mean one of: a/x.md, b/x.md")
    readRepoFile.mockResolvedValue({ candidates: [] })
    expect(await call("read_repository_file", { path: "zzz" })).toContain("Use search_repository_docs")
  })

  it("never reads another project's repositories (scope comes from the caller's project)", async () => {
    listKnowledgeRepos.mockImplementation(async (projectId: string) => (projectId === "other" ? [] : [SPEC]))
    expect(await call("read_repository_file", { path: "a.md" }, "other")).toBe("No reference repository is set up for this project.")
    expect(readRepoFile).not.toHaveBeenCalled()
  })
})

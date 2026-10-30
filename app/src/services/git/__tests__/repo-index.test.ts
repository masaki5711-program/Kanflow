import { beforeEach, describe, expect, it, vi } from "vitest"

type Chunk = { repositoryId: string; projectId: string; path: string; heading: string | null; anchor: string | null; chunkNo: number; content: string; blobSha: string }
type Where = { repositoryId?: string; path?: string; chunkNo?: number }

const db = vi.hoisted(() => ({ chunks: [] as Chunk[], repo: null as Record<string, unknown> | null, updates: [] as Record<string, unknown>[] }))
const matches = (c: Chunk, w: Where = {}) => (w.repositoryId === undefined || c.repositoryId === w.repositoryId) && (w.path === undefined || c.path === w.path) && (w.chunkNo === undefined || c.chunkNo === w.chunkNo)

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gitRepository: {
      findUnique: vi.fn(async () => db.repo),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.updates.push(data)
        db.repo = { ...db.repo, ...data }
        return db.repo
      }),
    },
    repoChunk: {
      findMany: vi.fn(async ({ where }: { where: Where }) => db.chunks.filter((c) => matches(c, where))),
      count: vi.fn(async ({ where }: { where: Where }) => db.chunks.filter((c) => matches(c, where)).length),
      deleteMany: vi.fn(({ where }: { where: Where }) => {
        const before = db.chunks.length
        db.chunks = db.chunks.filter((c) => !matches(c, where))
        return Promise.resolve({ count: before - db.chunks.length })
      }),
      createMany: vi.fn(({ data }: { data: Chunk[] }) => {
        db.chunks = [...db.chunks, ...data]
        return Promise.resolve({ count: data.length })
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock("@/lib/secret-box", () => ({ open: (s: string | null) => (s ? "plain-token-value" : null) }))
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: vi.fn() }))

const { indexRepository } = await import("../repo-index")
const { GitLabError } = await import("@/lib/git/gitlab-client")
const { gitBlobSha } = await import("../repo-index-plan")

const HEAD = "head-sha"
const FILES: Record<string, string> = {
  "docs/a.md": "# A\nOEE text.",
  "docs/b.md": "# B\npassword = \"Kanflow-2026!\"",
  "src/x.ts": "export const x = 1",
}

function repoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    projectId: "p1",
    apiBase: "https://gitlab.example",
    repoPath: "g/spec",
    externalId: 7,
    tokenCipher: null,
    aiKnowledge: true,
    aiPathFilter: null,
    indexedSha: null,
    indexedAt: null,
    indexTargetSha: null,
    indexCursor: null,
    project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitlab", tokenCipher: "sealed" } },
    ...overrides,
  }
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getProject: vi.fn(),
    latestCommitSha: vi.fn().mockResolvedValue(HEAD),
    listTree: vi.fn().mockResolvedValue([
      ...Object.keys(FILES).map((path) => ({ id: gitBlobSha(Buffer.from(FILES[path])), path, type: "blob" })),
      { id: "e", path: ".env", type: "blob" },
      { id: "p", path: "docs/logo.png", type: "blob" },
      { id: "t", path: "docs", type: "tree" },
    ]),
    compare: vi.fn(),
    rawFile: vi.fn(async (_id: number, path: string) => ({ kind: "ok", data: Buffer.from(FILES[path] ?? "") })),
    ...overrides,
  }
}

const run = (client: ReturnType<typeof fakeClient>, opts: Record<string, unknown> = {}) =>
  indexRepository("r1", { factory: () => client as never, pauseMs: 0, ...opts })

beforeEach(() => {
  vi.clearAllMocks()
  db.chunks = []
  db.updates = []
  db.repo = repoRow()
})

describe("indexRepository — guards", () => {
  it("does nothing for a repository that is not AI knowledge or whose integration is off", async () => {
    db.repo = repoRow({ aiKnowledge: false })
    expect((await run(fakeClient())).status).toBe("disabled")
    db.repo = repoRow({ project: { deletedAt: null, gitIntegration: { enabled: false, tokenCipher: "s" } } })
    expect((await run(fakeClient())).status).toBe("disabled")
  })

  it("never sends a provider Kanflow cannot read to GitLab: refused with the provider message, logged once", async () => {
    db.repo = repoRow({ project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation", tokenCipher: "sealed" } } })
    const client = fakeClient()
    const factory = vi.fn(() => client)
    const first = await indexRepository("r1", { factory: factory as never })
    await indexRepository("r1", { factory: factory as never })
    expect(first).toMatchObject({ status: "failed", error: expect.stringContaining("gitstation") })
    expect(factory).not.toHaveBeenCalled()
    expect(noopLog.error.mock.calls.filter((c) => c[0] === "git provider unsupported")).toEqual([["git provider unsupported", { repositoryId: "r1", provider: "gitstation", skipped: "index" }]])
  })

  it("costs one request when the branch did not move", async () => {
    db.repo = repoRow({ indexedSha: HEAD, indexedAt: new Date() })
    const client = fakeClient()
    expect((await run(client)).status).toBe("up_to_date")
    expect(client.listTree).not.toHaveBeenCalled()
    expect(db.updates).toEqual([])
  })

  it("clears an old error once GitLab answers again, even though the branch did not move", async () => {
    db.repo = repoRow({ indexedSha: HEAD, indexedAt: new Date(), indexError: "GitLab に接続できませんでした。次回の同期で再試行します。", indexErrorAt: new Date() })
    expect((await run(fakeClient())).status).toBe("up_to_date")
    expect(db.updates).toEqual([{ indexError: null, indexErrorAt: null }])
  })
})

describe("indexRepository — first (full) pass", () => {
  it("indexes included files only, never downloading secrets or images, and records the result", async () => {
    const client = fakeClient()
    const result = await run(client)
    expect(result).toMatchObject({ status: "done", processed: 3, skipped: 0 })
    expect(client.rawFile.mock.calls.map((c) => c[1]).sort()).toEqual(["docs/a.md", "docs/b.md", "src/x.ts"])
    expect([...new Set(db.chunks.map((c) => c.path))].sort()).toEqual(["docs/a.md", "docs/b.md", "src/x.ts"])
    expect(db.chunks.every((c) => c.projectId === "p1" && c.repositoryId === "r1")).toBe(true)
    expect(db.chunks.find((c) => c.path === "docs/a.md")?.blobSha).toBe(gitBlobSha(Buffer.from(FILES["docs/a.md"])))
    expect(db.repo).toMatchObject({ indexedSha: HEAD, indexedFiles: 3, indexTargetSha: null, indexCursor: null, indexError: null })
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "git", projectId: "p1", action: "index" })
  })

  it("redacts secret-looking values before storing", async () => {
    await run(fakeClient())
    const b = db.chunks.find((c) => c.path === "docs/b.md")
    expect(b?.content).toContain("[REDACTED]")
    expect(b?.content).not.toContain("Kanflow-2026!")
  })

  it("applies the folder filter", async () => {
    db.repo = repoRow({ aiPathFilter: "docs/" })
    const client = fakeClient()
    await run(client)
    expect(client.rawFile.mock.calls.map((c) => c[1]).sort()).toEqual(["docs/a.md", "docs/b.md"])
  })

  it("skips a file that is too large and drops its old passages", async () => {
    db.chunks = [{ repositoryId: "r1", projectId: "p1", path: "src/x.ts", heading: null, anchor: "L1", chunkNo: 0, content: "old", blobSha: "old" }]
    const client = fakeClient({ rawFile: vi.fn(async (_i: number, path: string) => (path === "src/x.ts" ? { kind: "too_large" } : { kind: "ok", data: Buffer.from(FILES[path]) })) })
    const result = await run(client)
    expect(result).toMatchObject({ status: "done", processed: 2, skipped: 1 })
    expect(db.chunks.some((c) => c.path === "src/x.ts")).toBe(false)
  })
})

describe("indexRepository — incremental pass", () => {
  it("uses the compare: re-indexes changed files and removes deleted ones without listing the tree", async () => {
    db.repo = repoRow({ indexedSha: "old-sha", indexedAt: new Date() })
    db.chunks = [
      { repositoryId: "r1", projectId: "p1", path: "docs/gone.md", heading: null, anchor: null, chunkNo: 0, content: "gone", blobSha: "g" },
      { repositoryId: "r1", projectId: "p1", path: "docs/a.md", heading: null, anchor: null, chunkNo: 0, content: "old a", blobSha: "a0" },
    ]
    const client = fakeClient({
      compare: vi.fn().mockResolvedValue({
        diffs: [
          { old_path: "docs/a.md", new_path: "docs/a.md", new_file: false, renamed_file: false, deleted_file: false },
          { old_path: "docs/gone.md", new_path: "docs/gone.md", new_file: false, renamed_file: false, deleted_file: true },
        ],
      }),
    })
    const result = await run(client)
    expect(result).toMatchObject({ status: "done", processed: 2 })
    expect(client.compare).toHaveBeenCalledWith(7, "old-sha", HEAD)
    expect(client.listTree).not.toHaveBeenCalled()
    expect(client.rawFile.mock.calls.map((c) => c[1])).toEqual(["docs/a.md"])
    expect(db.chunks.map((c) => c.path)).toEqual(["docs/a.md"])
    expect(db.chunks[0].content).toContain("OEE text.")
  })

  it("falls back to a full pass when the indexed commit vanished (compare 404)", async () => {
    db.repo = repoRow({ indexedSha: "force-pushed-away", indexedAt: new Date() })
    const client = fakeClient({ compare: vi.fn().mockRejectedValue(new GitLabError("not_found", "x", 404)) })
    expect((await run(client)).status).toBe("done")
    expect(client.listTree).toHaveBeenCalledWith(7, HEAD, expect.any(Number))
  })

  it.each(["rate_limited", "network"] as const)("backs off on a %s compare error instead of scanning the whole tree", async (kind) => {
    db.repo = repoRow({ indexedSha: "old", indexedAt: new Date() })
    const client = fakeClient({ compare: vi.fn().mockRejectedValue(new GitLabError(kind, "x")) })
    expect((await run(client)).status).toBe("failed")
    expect(client.listTree).not.toHaveBeenCalled()
    expect(client.rawFile).not.toHaveBeenCalled()
  })

  it("fails (not falls back) when the compare is refused for a token reason", async () => {
    db.repo = repoRow({ indexedSha: "old", indexedAt: new Date() })
    const client = fakeClient({ compare: vi.fn().mockRejectedValue(new GitLabError("auth", "x", 401)) })
    const result = await run(client)
    expect(result.status).toBe("failed")
    expect(client.listTree).not.toHaveBeenCalled()
    expect(String(db.repo?.indexError)).toContain("トークン")
  })
})

describe("indexRepository — time budget and resume", () => {
  it("stops at the deadline, keeps the cursor and resumes after it next time", async () => {
    const client = fakeClient()
    const deadline = Date.now() + 60_000
    // The first download "takes" past the deadline.
    const clock = vi.spyOn(Date, "now")
    client.rawFile.mockImplementationOnce(async (_i: number, path: string) => {
      clock.mockReturnValue(deadline + 1)
      return { kind: "ok", data: Buffer.from(FILES[path]) }
    })
    const first = await run(client, { deadline })
    clock.mockRestore()
    expect(first).toMatchObject({ status: "partial", processed: 1 })
    expect(db.repo).toMatchObject({ indexTargetSha: HEAD, indexCursor: "docs/a.md", indexedSha: null })

    const resumed = await run(client)
    expect(resumed).toMatchObject({ status: "done", processed: 2 })
    expect(client.rawFile.mock.calls.map((c) => c[1])).toEqual(["docs/a.md", "docs/b.md", "src/x.ts"])
    expect(db.repo).toMatchObject({ indexedSha: HEAD, indexedFiles: 3, indexCursor: null })
  })
})

describe("indexRepository — errors", () => {
  it("stores a Japanese error on the repository and never the token", async () => {
    const client = fakeClient({ latestCommitSha: vi.fn().mockRejectedValue(new GitLabError("network", "GitLab unreachable", undefined)) })
    const result = await run(client)
    expect(result.status).toBe("failed")
    expect(String(db.repo?.indexError)).toContain("GitLab に接続できませんでした")
    expect(JSON.stringify(db.updates)).not.toContain("plain-token-value")
  })

  it("reports a missing token without calling GitLab", async () => {
    db.repo = repoRow({ project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitlab", tokenCipher: null } } })
    const client = fakeClient()
    expect((await run(client)).status).toBe("failed")
    expect(client.latestCommitSha).not.toHaveBeenCalled()
  })
})

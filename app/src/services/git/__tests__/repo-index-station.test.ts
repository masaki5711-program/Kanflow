import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeStation, oidOf, HEAD, OTHER_HEAD, type FakeFile } from "./fake-gitstation-files"

/** AI の参照資料 from a GitStation repository (N12), end to end through repo-index with a fake GitStation. Synthetic data only. */

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
const noopLog = vi.hoisted(() => {
  const log: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  log.child = () => log
  return log as { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; child: () => unknown }
})
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: vi.fn() }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: vi.fn() }))

const { indexRepository } = await import("../repo-index")
const { GitStationError } = await import("@/lib/git/gitstation-client")
const messages = await import("@/lib/git/sync-messages")

const FILES: Record<string, FakeFile> = {
  "README.md": { content: "# Spec\nOverview of the line." },
  "docs/a.md": { content: "# A\nOEE text." },
  "docs/b.md": { content: '# B\npassword = "Kanflow-2026!"' },
  "docs/deep/c.md": { content: "# C\nDeep text." },
  "src/x.ts": { content: "export const x = 1" },
  "node_modules/lib/index.js": { content: "module.exports = 1" },
  ".env": { content: "TOKEN=x" },
}

function repoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    projectId: "p1",
    apiBase: "https://station.example.test",
    repoPath: "g/spec",
    externalId: 7,
    tokenCipher: null,
    aiKnowledge: true,
    aiPathFilter: null,
    indexedSha: null,
    indexedAt: null,
    indexTargetSha: null,
    indexCursor: null,
    indexError: null,
    project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation", tokenCipher: "sealed", stationIntegrationId: "int_7" } },
    ...overrides,
  }
}

const chunk = (path: string, blobSha = "old", content = "old"): Chunk => ({ repositoryId: "r1", projectId: "p1", path, heading: null, anchor: null, chunkNo: 0, content, blobSha })
const paths = () => [...new Set(db.chunks.map((c) => c.path))].sort()
const routes = (station: ReturnType<typeof fakeStation>, route: string) => station.calls.filter((c) => c.route === route)

let gitlabFactory: ReturnType<typeof vi.fn>
const run = (station: ReturnType<typeof fakeStation>, opts: Record<string, unknown> = {}) =>
  indexRepository("r1", { stationFactory: station.factory, factory: gitlabFactory as never, pauseMs: 0, ...opts })

beforeEach(() => {
  vi.clearAllMocks()
  db.chunks = []
  db.updates = []
  db.repo = repoRow()
  gitlabFactory = vi.fn()
})

describe("GitStation knowledge — first pass", () => {
  it("lists folder by folder, indexes included files with redaction, never asks GitLab", async () => {
    const station = fakeStation({ files: FILES })
    const result = await run(station)
    expect(result).toMatchObject({ status: "done", processed: 5, skipped: 0 })
    expect(paths()).toEqual(["README.md", "docs/a.md", "docs/b.md", "docs/deep/c.md", "src/x.ts"])
    // Excluded folders are never listed, secrets never read.
    expect(routes(station, "tree").map((c) => c.query.path ?? "")).toEqual(["", "docs", "docs/deep", "src"])
    expect(routes(station, "blob").map((c) => c.query.path)).not.toContain(".env")
    // By the branch NAME, never a commit id.
    expect(new Set(station.calls.filter((c) => c.route !== "refs").map((c) => c.query.ref))).toEqual(new Set(["refs/heads/main"]))
    const b = db.chunks.find((c) => c.path === "docs/b.md")
    expect(b?.content).toContain("[REDACTED]")
    expect(b?.content).not.toContain("Kanflow-2026!")
    expect(db.chunks.find((c) => c.path === "docs/a.md")?.blobSha).toBe(oidOf(FILES["docs/a.md"]))
    expect(db.repo).toMatchObject({ indexedSha: HEAD, indexedFiles: 5, indexError: null, indexCursor: null })
    expect(gitlabFactory).not.toHaveBeenCalled()
  })

  it("enters only the filtered folders (and the folders on the way to them)", async () => {
    db.repo = repoRow({ aiPathFilter: "docs/deep/" })
    const station = fakeStation({ files: FILES })
    await run(station)
    expect(routes(station, "tree").map((c) => c.query.path ?? "")).toEqual(["", "docs", "docs/deep"])
    expect(paths()).toEqual(["docs/deep/c.md"])
  })

  it("skips confidential, binary, oversized and Office files, removing what was stored for them — never an error", async () => {
    db.chunks = [chunk("docs/secret.md"), chunk("docs/pic.svg.txt"), chunk("docs/big.md"), chunk("docs/spec.docx")]
    const station = fakeStation({
      files: {
        "docs/a.md": { content: "# A\nOEE text." },
        "docs/secret.md": { confidential: true },
        "docs/pic.svg.txt": { binary: true },
        "docs/big.md": { size: 2 * 1024 * 1024 },
        "docs/spec.docx": { content: "PK" },
      },
    })
    const result = await run(station)
    expect(result).toMatchObject({ status: "done", processed: 1, skipped: 4 })
    expect(paths()).toEqual(["docs/a.md"])
    expect(db.repo?.indexError).toBeNull()
    // The oversized file and the Office file are not even requested.
    expect(routes(station, "blob").map((c) => c.query.path).sort()).toEqual(["docs/a.md", "docs/pic.svg.txt", "docs/secret.md"])
    expect(noopLog.info).toHaveBeenCalledWith("repository indexed", expect.objectContaining({ skippedBy: { confidential: 1, binary: 1, too_large: 1, unsupported_kind: 1 } }))
  })

  it("removes every passage of an empty repository", async () => {
    db.chunks = [chunk("docs/a.md")]
    const station = fakeStation({ files: {}, defaultBranch: null })
    expect((await run(station)).status).toBe("done")
    expect(db.chunks).toEqual([])
  })

  it("never wipes the index on a default branch GitStation names but does not list: a failure, passages kept", async () => {
    db.chunks = [chunk("docs/a.md")]
    const station = fakeStation({ files: FILES, hideDefaultRef: true })
    expect(await run(station)).toMatchObject({ status: "failed", error: messages.STATION_NOT_FOUND_MESSAGE })
    expect(paths()).toEqual(["docs/a.md"])
  })

  it("re-checks what was stored before a reset (first pass after a filter change): a document now confidential goes", async () => {
    const secret: FakeFile = { confidential: true, content: "# A\nOEE text." }
    db.chunks = [chunk("docs/a.md", oidOf(secret)), chunk("src/x.ts", oidOf(FILES["src/x.ts"]))]
    const station = fakeStation({ files: { ...FILES, "docs/a.md": secret } })
    expect((await run(station)).status).toBe("done")
    expect(paths()).not.toContain("docs/a.md")
    // Unchanged code is not read again.
    expect(routes(station, "blob").map((c) => c.query.path)).not.toContain("src/x.ts")
  })

  it("never indexes a path with a control character (it would reach the chat's tool output as text)", async () => {
    const station = fakeStation({ files: { "docs/a.md": { content: "# A\nOEE text." }, "docs/evil\nurl: x.md": { content: "# E\nText." }, "bad\ndir/b.md": { content: "# B\nText." } } })
    expect((await run(station)).status).toBe("done")
    expect(paths()).toEqual(["docs/a.md"])
  })
})

describe("GitStation knowledge — guards and errors", () => {
  it("indexes nothing from a repository GitStation does not bind to this project, and removes what was stored", async () => {
    db.repo = repoRow({ indexedSha: HEAD, indexedAt: new Date(), indexedFiles: 1 })
    db.chunks = [chunk("docs/a.md")]
    const station = fakeStation({ files: FILES, boundTo: "another-project" })
    const result = await run(station)
    expect(result).toMatchObject({ status: "failed", error: messages.STATION_NOT_BOUND_MESSAGE })
    expect(station.calls).toEqual([])
    // The project no longer holds that repository's content: the chat cannot quote it any more.
    expect(db.chunks).toEqual([])
    expect(db.repo).toMatchObject({ indexedSha: null, indexedFiles: 0 })
  })

  it("asks for the integration id before anything is sent", async () => {
    db.repo = repoRow({ project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation", tokenCipher: "sealed", stationIntegrationId: null } } })
    const station = fakeStation({ files: FILES })
    expect(await run(station)).toMatchObject({ status: "failed", error: messages.STATION_MISSING_INTEGRATION_MESSAGE })
    expect(station.factory).not.toHaveBeenCalled()
  })

  it("asks for a token without calling GitStation", async () => {
    db.repo = repoRow({ project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitstation", tokenCipher: null, stationIntegrationId: "int_7" } } })
    const station = fakeStation({ files: FILES })
    expect(await run(station)).toMatchObject({ status: "failed", error: messages.INDEX_TOKEN_MISSING_MESSAGE })
    expect(station.factory).not.toHaveBeenCalled()
  })

  it.each([
    ["unavailable", 503, messages.STATION_UNAVAILABLE_MESSAGE],
    ["auth", 401, messages.STATION_AUTH_MESSAGE],
    ["network", undefined, messages.STATION_NETWORK_MESSAGE],
  ] as const)("fails on %s mid-pass, keeping every stored passage and the cursor", async (kind, status, message) => {
    db.chunks = [chunk("docs/a.md"), chunk("src/x.ts")]
    const station = fakeStation({ files: FILES })
    const original = station.client.repositoryGet.getMockImplementation() as (...a: unknown[]) => Promise<unknown>
    station.client.repositoryGet.mockImplementation(async (id: number, route: string, query: Record<string, string | undefined>) => {
      if (route === "blob" && query.path === "docs/b.md") throw new GitStationError(kind, "x", status)
      return original(id, route, query)
    })
    const result = await run(station)
    expect(result).toMatchObject({ status: "failed", error: message })
    expect(db.repo).toMatchObject({ indexError: message, indexCursor: "docs/a.md", indexTargetSha: HEAD })
    expect(paths()).toContain("src/x.ts")
    expect(noopLog.error).not.toHaveBeenCalled()
  })

  it("fails on another 403 than a confidential document (the token lost access)", async () => {
    const station = fakeStation({ files: { "docs/a.md": { content: "# A" } } })
    station.client.repositoryGet.mockImplementationOnce(async () => {
      throw new GitStationError("forbidden", "x", 403, { errorCode: "FG-AUTH-0001" })
    })
    expect(await run(station)).toMatchObject({ status: "failed", error: messages.STATION_FORBIDDEN_MESSAGE })
  })

  it("logs and stores the generic text for an error that is not GitStation's", async () => {
    const station = fakeStation({ files: FILES })
    station.client.resolveProject.mockRejectedValueOnce(new TypeError("boom"))
    expect(await run(station)).toMatchObject({ status: "failed", error: messages.INDEX_FAILED_MESSAGE })
    expect(noopLog.error).toHaveBeenCalledWith("repository index failed", { repositoryId: "r1", error: "boom" })
  })

  it("fails with its own message when the folder walk cannot finish in time", async () => {
    const station = fakeStation({ files: FILES })
    const result = await run(station, { deadline: Date.now() - 1 })
    expect(result).toMatchObject({ status: "failed", error: messages.KNOWLEDGE_LISTING_SLOW_MESSAGE })
  })
})

describe("GitStation knowledge — moving branch, resume, up to date", () => {
  it("pauses when the branch moves mid-pass, deletes nothing, and plans again against the new head", async () => {
    db.chunks = [chunk("docs/old.md")]
    const station = fakeStation({ files: FILES })
    const original = station.client.repositoryGet.getMockImplementation() as (...a: unknown[]) => Promise<unknown>
    station.client.repositoryGet.mockImplementation(async (id: number, route: string, query: Record<string, string | undefined>) => {
      if (route === "blob" && query.path === "docs/b.md") station.moveTo(OTHER_HEAD)
      return original(id, route, query)
    })
    const first = await run(station)
    expect(first.status).toBe("partial")
    expect(paths()).toContain("docs/old.md")
    expect(db.repo).toMatchObject({ indexTargetSha: HEAD, indexedSha: null })

    const second = await run(station)
    expect(second.status).toBe("done")
    expect(db.repo).toMatchObject({ indexedSha: OTHER_HEAD, indexTargetSha: null })
    expect(paths()).not.toContain("docs/old.md")
  })

  it("resumes after the cursor without reading finished files again", async () => {
    const station = fakeStation({ files: FILES })
    const deadline = Date.now() + 60_000
    const clock = vi.spyOn(Date, "now")
    const original = station.client.repositoryGet.getMockImplementation() as (...a: unknown[]) => Promise<unknown>
    station.client.repositoryGet.mockImplementation(async (id: number, route: string, query: Record<string, string | undefined>) => {
      if (route === "blob" && query.path === "docs/a.md") clock.mockReturnValue(deadline + 1)
      return original(id, route, query)
    })
    const first = await run(station, { deadline })
    clock.mockRestore()
    expect(first.status).toBe("partial")
    const read = routes(station, "blob").length
    const resumed = await run(station)
    expect(resumed.status).toBe("done")
    const again = routes(station, "blob").slice(read).map((c) => c.query.path)
    expect(again).not.toContain("README.md")
    expect(again).not.toContain("docs/a.md")
    expect(paths()).toEqual(["README.md", "docs/a.md", "docs/b.md", "docs/deep/c.md", "src/x.ts"])
  })

  it("lists nothing and reads nothing when the branch did not move, and clears an old error", async () => {
    db.repo = repoRow({ indexedSha: HEAD, indexedAt: new Date(), indexError: messages.STATION_NETWORK_MESSAGE, indexErrorAt: new Date() })
    const station = fakeStation({ files: FILES })
    expect((await run(station)).status).toBe("up_to_date")
    expect(station.calls.map((c) => c.route)).toEqual(["refs"])
    expect(db.updates).toEqual([{ indexError: null, indexErrorAt: null }])
  })

  it("re-checks stored documents once a day although the branch did not move: one now confidential goes", async () => {
    const secret: FakeFile = { confidential: true, content: "# A\nOEE text." }
    db.repo = repoRow({ indexedSha: HEAD, indexedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    db.chunks = [chunk("docs/a.md", oidOf(secret)), chunk("src/x.ts", oidOf(FILES["src/x.ts"]))]
    const station = fakeStation({ files: { ...FILES, "docs/a.md": secret } })
    expect((await run(station)).status).toBe("done")
    expect(paths()).not.toContain("docs/a.md")
    expect(paths()).toContain("src/x.ts")
    expect(routes(station, "compare")).toEqual([])
    expect(db.repo).toMatchObject({ indexedSha: HEAD })

    // Re-checked: the next call within the day is up to date again.
    const calls = station.calls.length
    expect((await run(station)).status).toBe("up_to_date")
    expect(station.calls.slice(calls).map((c) => c.route)).toEqual(["refs"])
  })

  it("moves the cursor even when listing used up the call's time (a pass that never progresses would hide the problem)", async () => {
    const station = fakeStation({ files: FILES })
    const deadline = Date.now() + 60_000
    const clock = vi.spyOn(Date, "now")
    const original = station.client.repositoryGet.getMockImplementation() as (...a: unknown[]) => Promise<unknown>
    station.client.repositoryGet.mockImplementation(async (id: number, route: string, query: Record<string, string | undefined>) => {
      // The last folder answer arrives after the deadline.
      if (route === "tree" && query.path === "src") clock.mockReturnValue(deadline + 1)
      return original(id, route, query)
    })
    const result = await run(station, { deadline })
    clock.mockRestore()
    expect(result).toMatchObject({ status: "partial", processed: 1 })
    expect(db.repo?.indexCursor).toBe("README.md")
  })
})

describe("GitStation knowledge — incremental pass", () => {
  const compareAt = (files: unknown[], extra: Record<string, unknown> = {}) => () => ({
    from: { type: "commit", name: "old", full_name: null, commit: "a".repeat(40) },
    to: { type: "branch", name: "main", full_name: "refs/heads/main", commit: HEAD },
    commits: [],
    commits_truncated: false,
    diff: { files, truncated: false, ...extra },
  })
  const file = (status: string, oldPath: string | null, newPath: string | null) => ({ status, old_path: oldPath, new_path: newPath, binary: false, patch: null })

  it("applies the compare: re-reads changed files, removes deleted ones and the old side of a rename, without listing", async () => {
    db.repo = repoRow({ indexedSha: "a".repeat(40), indexedAt: new Date() })
    db.chunks = [chunk("docs/a.md"), chunk("docs/gone.md"), chunk("docs/old-name.md"), chunk("src/x.ts", oidOf(FILES["src/x.ts"]))]
    const station = fakeStation({
      files: FILES,
      compare: compareAt([file("modified", "docs/a.md", "docs/a.md"), file("deleted", "docs/gone.md", null), file("renamed", "docs/old-name.md", "docs/deep/c.md")]),
    })
    const result = await run(station)
    expect(result).toMatchObject({ status: "done", processed: 4 })
    expect(routes(station, "tree")).toEqual([])
    expect(routes(station, "compare")[0].query).toEqual({ from: "a".repeat(40), to: "refs/heads/main" })
    expect(routes(station, "blob").map((c) => c.query.path)).toEqual(["docs/a.md", "docs/deep/c.md"])
    expect(paths()).toEqual(["docs/a.md", "docs/deep/c.md", "src/x.ts"])
  })

  it.each([
    ["documents were withheld from it", { withheld: { error_code: "FG-AUTH-0021", documents: 1, requirements: 0, work_items: 0, files: 1 } }, []],
    ["it was truncated", { truncated: true }, []],
    ["a .forge/ file changed (a doctype default may have changed)", {}, [{ status: "modified", old_path: ".forge/doctypes/spec.yml", new_path: ".forge/doctypes/spec.yml", binary: false, patch: null }]],
  ])("walks and reads stored Markdown again when %s", async (_why, extra, files) => {
    db.repo = repoRow({ indexedSha: "a".repeat(40), indexedAt: new Date() })
    // docs/a.md became confidential without its content changing: its stored id still matches the listing.
    const station = fakeStation({ files: { ...FILES, "docs/a.md": { confidential: true, content: "# A\nOEE text." } }, compare: compareAt(files, extra) })
    db.chunks = [chunk("docs/a.md", oidOf({ confidential: true, content: "# A\nOEE text." })), chunk("src/x.ts", oidOf(FILES["src/x.ts"]))]
    const result = await run(station)
    expect(result.status).toBe("done")
    expect(routes(station, "tree").length).toBeGreaterThan(0)
    // Its passages are gone; unchanged code is not read again.
    expect(paths()).not.toContain("docs/a.md")
    expect(routes(station, "blob").map((c) => c.query.path)).not.toContain("src/x.ts")
  })

  it("walks when the base commit is gone (compare 404) and fails on a token problem", async () => {
    db.repo = repoRow({ indexedSha: "a".repeat(40), indexedAt: new Date() })
    expect((await run(fakeStation({ files: FILES }))).status).toBe("done")

    db.repo = repoRow({ indexedSha: "a".repeat(40), indexedAt: new Date() })
    const refused = fakeStation({
      files: FILES,
      compare: () => {
        throw new GitStationError("auth", "x", 401)
      },
    })
    expect(await run(refused)).toMatchObject({ status: "failed", error: messages.STATION_AUTH_MESSAGE })
    expect(routes(refused, "tree")).toEqual([])
  })

  it("fails on a network error of the compare instead of adding a full listing during an outage", async () => {
    db.repo = repoRow({ indexedSha: "a".repeat(40), indexedAt: new Date() })
    const station = fakeStation({
      files: FILES,
      compare: () => {
        throw new GitStationError("network", "x")
      },
    })
    expect(await run(station)).toMatchObject({ status: "failed", error: messages.STATION_NETWORK_MESSAGE })
    expect(routes(station, "tree")).toEqual([])
  })
})

describe("GitStation knowledge — incomplete listing", () => {
  it("never deletes a stored file the listing could not see; deletes one proven gone", async () => {
    db.chunks = [chunk("docs/z-unlisted.md"), chunk("src/gone.ts")]
    // GitStation lists only the first entry of docs/ (a.md): z-unlisted.md may well still be there.
    const station = fakeStation({ files: { ...FILES, "docs/z-unlisted.md": { content: "# Z" } }, truncatedDirs: { docs: 1 } })
    const result = await run(station)
    expect(result.status).toBe("done")
    expect(paths()).toContain("docs/z-unlisted.md")
    // src/ was listed completely and has no gone.ts.
    expect(paths()).not.toContain("src/gone.ts")
    expect(noopLog.warn).toHaveBeenCalledWith("repository listing is incomplete", expect.objectContaining({ truncatedLevels: 1 }))
    // Shown, translated, until a complete listing clears it — an up-to-date call does not.
    expect(db.repo?.indexError).toBe(messages.KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE)
    expect((await run(station)).status).toBe("up_to_date")
    expect(db.repo?.indexError).toBe(messages.KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE)
  })

  it("clears the incomplete-listing warning once a listing sees everything", async () => {
    db.repo = repoRow({ indexError: messages.KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE, indexErrorAt: new Date() })
    expect((await run(fakeStation({ files: FILES }))).status).toBe("done")
    expect(db.repo?.indexError).toBeNull()
  })
})

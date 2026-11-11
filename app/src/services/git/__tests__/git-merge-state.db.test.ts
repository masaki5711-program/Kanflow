import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { DevMergeState, DevSourceErrorInfo } from "../dev-source"

/**
 * N4 / N5: the merge-state step on a REAL PostgreSQL (jsonb key order, DB NULL in JSON columns, field references).
 * Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a disposable test database (synthetic rows, removed).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

const logs = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", () => {
  const log = { ...logs, child: () => log }
  return { logger: log }
})

const NOW = new Date("2026-10-02T00:00:00.000Z")

class FakeError extends Error {
  constructor(readonly kind: string, readonly status?: number) {
    super(kind)
  }
}

describe.skipIf(!enabled)("refreshMergeStates on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `n4test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, repo: `${tag}-r`, pbi: `${tag}-b` }
  let prisma: typeof import("@/lib/prisma").prisma
  let step: typeof import("../git-merge-state")

  const state = (over: Partial<DevMergeState> = {}): DevMergeState => ({
    mergeable: false,
    blockers: [{ reason: "approvals_missing", detail: "rule=default required=2 counted=1" }],
    conflicts: { status: "scanned", reason: null, stale: false, scannedAt: "2026-10-01T00:00:00.000Z", peers: [{ iid: 7, draft: false, outcome: "conflict", files: 2, truncated: false }] },
    ...over,
  })
  const describeError = (err: unknown): DevSourceErrorInfo => ({ kind: err instanceof FakeError ? err.kind : "http", expected: true, status: err instanceof FakeError ? err.status : undefined, message: "x" })
  const source = (read: (ref: string) => Promise<DevMergeState>) => ({ mergeState: vi.fn(read), describeError })
  const link = (ref: string, over: Record<string, unknown> = {}) => ({
    projectId: ids.project, repositoryId: ids.repo, backlogItemId: ids.pbi, kind: "mr", ref, title: `MR ${ref}`, url: "https://gitstation.example/x", state: "opened", occurredAt: new Date("2026-10-01T00:00:00.000Z"), ...over,
  })
  const row = (ref: string) => prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repo, ref } })

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    step = await import("../git-merge-state")
    await prisma.project.create({ data: { id: ids.project, name: tag } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.project, displayId: 1, initiative: "synthetic" } })
    await prisma.gitRepository.create({ data: { id: ids.repo, projectId: ids.project, name: "app/portal", webUrl: "https://gitstation.example/app/portal", apiBase: "https://gitstation.example", repoPath: "app/portal" } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitRepository.deleteMany({ where: { id: ids.repo } })
    await prisma.productBacklogItem.deleteMany({ where: { id: ids.pbi } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
  })

  beforeEach(async () => {
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    for (const f of Object.values(logs)) f.mockClear()
  })

  it("stores the state, and reading the same state again counts as no change (jsonb reorders keys)", async () => {
    await prisma.gitLink.create({ data: link("1") })
    const s = source(async () => state())
    expect(await step.refreshMergeStates(s, ids.repo, [{ ref: "1", state: "opened" }], NOW)).toBe(1)
    expect(await row("1")).toMatchObject({ mergeable: false, mergeStatusAt: NOW, mergeStatusTriedAt: NOW })
    expect(await step.refreshMergeStates(s, ids.repo, [{ ref: "1", state: "opened" }], NOW)).toBe(0)
  })

  it("a prediction GitStation did not give is stored as 'unavailable' (shown as not checked), never as 'no conflict'", async () => {
    await prisma.gitLink.create({ data: link("1") })
    await step.refreshMergeStates(source(async () => state({ conflicts: null })), ids.repo, [{ ref: "1", state: "opened" }], NOW)
    expect((await row("1")).conflictPrediction).toMatchObject({ status: "unavailable", peers: [] })
  })

  it("a failed read clears the shown state and waits RETRY_AFTER_MS before that MR is tried again; others go first", async () => {
    await prisma.gitLink.createMany({ data: [link("1"), link("2")] })
    const failing = source(async (ref) => {
      if (ref === "1") throw new FakeError("not_found", 404)
      return state()
    })
    await step.refreshMergeStates(failing, ids.repo, [], NOW)
    expect(await row("1")).toMatchObject({ mergeStatusAt: null, mergeStatusTriedAt: NOW })
    expect(logs.warn).toHaveBeenCalledWith("git merge state not read", expect.objectContaining({ mr: "1", errorKind: "not_found", status: 404 }))
    failing.mergeState.mockClear()
    // Five minutes later: !1 is not due yet (it failed), !2 is fresh — !1 is not retried.
    await step.refreshMergeStates(failing, ids.repo, [], new Date(NOW.getTime() + 5 * 60_000))
    expect(failing.mergeState.mock.calls.map((c) => c[0])).not.toContain("1")
    failing.mergeState.mockClear()
    await step.refreshMergeStates(failing, ids.repo, [], new Date(NOW.getTime() + step.RETRY_AFTER_MS + 60_000))
    expect(failing.mergeState.mock.calls.map((c) => c[0])).toContain("1")
  })

  it("a merge request changed since it was read is due again (its own sync may have been over budget)", async () => {
    await prisma.gitLink.create({ data: link("1", { mergeStatusAt: NOW, mergeStatusTriedAt: NOW, occurredAt: new Date(NOW.getTime() + 60_000) }) })
    const s = source(async () => state())
    await step.refreshMergeStates(s, ids.repo, [], new Date(NOW.getTime() + 2 * 60_000))
    expect(s.mergeState).toHaveBeenCalledWith("1")
  })

  it("a change time ahead of the sync (GitStation's clock) does not make a merge request due on every sync", async () => {
    await prisma.gitLink.create({ data: link("1", { mergeStatusAt: NOW, mergeStatusTriedAt: NOW, occurredAt: new Date(NOW.getTime() + 30 * 60_000) }) })
    const s = source(async () => state())
    await step.refreshMergeStates(s, ids.repo, [], new Date(NOW.getTime() + 60_000))
    expect(s.mergeState).not.toHaveBeenCalled()
  })

  it("a refused service account stops the step at once and is logged as an error", async () => {
    await prisma.gitLink.createMany({ data: [link("1"), link("2"), link("3")] })
    const s = source(async () => {
      throw new FakeError("forbidden", 403)
    })
    await step.refreshMergeStates(s, ids.repo, [], NOW)
    expect(s.mergeState).toHaveBeenCalledTimes(1)
    expect(logs.error).toHaveBeenCalledWith("git merge state refused: the service account may not read merge status", { repositoryId: ids.repo })
  })

  it("GitStation busy stops the step for the repository (the next sync goes on)", async () => {
    await prisma.gitLink.createMany({ data: [link("1"), link("2")] })
    const s = source(async () => {
      throw new FakeError("rate_limited", 429)
    })
    await step.refreshMergeStates(s, ids.repo, [], NOW)
    expect(s.mergeState).toHaveBeenCalledTimes(1)
    expect(logs.warn).toHaveBeenCalledWith("git merge state stopped: GitStation busy or unreachable", { repositoryId: ids.repo, read: 1 })
  })

  it("every read failing in one sync is an error, not just warnings", async () => {
    await prisma.gitLink.createMany({ data: [link("1"), link("2")] })
    await step.refreshMergeStates(source(async () => Promise.reject(new FakeError("invalid_response"))), ids.repo, [], NOW)
    expect(logs.error).toHaveBeenCalledWith("git merge state: every read failed", { repositoryId: ids.repo, failures: 2 })
  })

  it("refs that are not merge request numbers are never read", async () => {
    await prisma.gitLink.create({ data: link("abc") })
    const s = source(async () => state())
    await step.refreshMergeStates(s, ids.repo, [{ ref: "abc", state: "opened" }, { ref: "1e1", state: "opened" }], NOW)
    expect(s.mergeState).not.toHaveBeenCalled()
  })

  it("stops starting reads once the time budget is spent", async () => {
    await prisma.gitLink.createMany({ data: [link("1"), link("2"), link("3")] })
    let t = 0
    const s = source(async () => {
      t += step.MERGE_STATE_BUDGET_MS / 2 + 1
      return state()
    })
    await step.refreshMergeStates(s, ids.repo, [], NOW, { clock: () => t })
    expect(s.mergeState).toHaveBeenCalledTimes(2)
  })
})

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { DevChangedPaths } from "@/services/git/dev-source"

/**
 * N6 / N7 / N9 / N10 on a REAL PostgreSQL: the changed-files step of the Git sync, the MR warnings of a declared scope
 * (declare_scope answer and the screens), the development copy for get_pbi / start_work, the chat's merge status
 * and 自分の MR で止まっているもの. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable
 * test database (synthetic rows only, removed afterwards).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

const logs = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", () => {
  const log = { ...logs, child: () => log }
  return { logger: log }
})

describe.skipIf(!enabled)("N6–N10 on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `n6test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, repo: `${tag}-r`, pbiA: `${tag}-a`, pbiB: `${tag}-b`, userA: `${tag}-ua`, userB: `${tag}-ub` }
  const now = new Date()
  let prisma: typeof import("@/lib/prisma").prisma

  const link = (ref: string, backlogItemId: string, over: Record<string, unknown> = {}) => ({
    projectId: ids.project,
    repositoryId: ids.repo,
    backlogItemId,
    kind: "mr",
    ref,
    title: `synthetic MR ${ref}`,
    url: `https://gitstation.example.test/g/app/-/merge_requests/${ref}`,
    state: "opened",
    occurredAt: new Date(now.getTime() - 60_000),
    ...over,
  })
  const source = (paths: Record<string, string[]>) => ({
    changedPaths: vi.fn(async (ref: string): Promise<DevChangedPaths> => {
      if (!(ref in paths)) throw new Error("not found")
      return { paths: paths[ref] ?? [], complete: true }
    }),
  })

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    await prisma.user.createMany({
      data: [
        { id: ids.userA, name: "Synthetic A", email: `${ids.userA}@example.test`, password: "synthetic" },
        { id: ids.userB, name: "Synthetic B", email: `${ids.userB}@example.test`, password: "synthetic" },
      ],
    })
    await prisma.project.create({ data: { id: ids.project, name: tag } })
    await prisma.gitIntegration.create({ data: { projectId: ids.project, enabled: true, provider: "gitstation" } })
    await prisma.productBacklogItem.createMany({
      data: [
        { id: ids.pbiA, projectId: ids.project, displayId: 1, initiative: "synthetic A" },
        { id: ids.pbiB, projectId: ids.project, displayId: 2, initiative: "synthetic B" },
      ],
    })
    await prisma.gitRepository.create({ data: { id: ids.repo, projectId: ids.project, name: "app", webUrl: "https://gitstation.example.test/g/app", apiBase: "https://gitstation.example.test", repoPath: "g/app", syncedAt: now } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.workClaim.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitRepository.deleteMany({ where: { id: ids.repo } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: ids.project } })
    await prisma.productBacklogItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } })
  })

  it("changed files are read only while someone declared a scope, stored, re-read after the MR changes, cleared when it closes", async () => {
    const { refreshChangedPaths } = await import("@/services/git/git-changed-paths")
    await prisma.gitLink.create({ data: link("11", ids.pbiB) })
    const repo = { id: ids.repo, projectId: ids.project }
    const src = source({ "11": ["app/src/services/dev-work/a.ts", "README.md"] })

    expect((await refreshChangedPaths(src, repo, [{ ref: "11", state: "opened" }], now)).read.size).toBe(0)
    expect(src.changedPaths).not.toHaveBeenCalled()

    // User A claims PBI 1 and declares a scope.
    const claim = await prisma.workClaim.create({ data: { projectId: ids.project, backlogItemId: ids.pbiA, userId: ids.userA, sessionId: "s-a", branch: "feature/PBI-1", heartbeatAt: now } })
    await prisma.workClaimScope.create({ data: { claimId: claim.id, kind: "path", value: "app/src/services/dev-work" } })

    const first = await refreshChangedPaths(src, repo, [{ ref: "11", state: "opened" }], now)
    expect(first.changed).toBe(1)
    expect(await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repo, ref: "11" } })).toMatchObject({ changedPaths: ["app/src/services/dev-work/a.ts", "README.md"], changedPathsComplete: true, changedPathsAt: now })

    // Not due again until the MR changes.
    src.changedPaths.mockClear()
    await refreshChangedPaths(src, repo, [], new Date(now.getTime() + 1000))
    expect(src.changedPaths).not.toHaveBeenCalled()
    await prisma.gitLink.updateMany({ where: { repositoryId: ids.repo, ref: "11" }, data: { occurredAt: new Date(now.getTime() + 2000) } })
    await refreshChangedPaths(src, repo, [], new Date(now.getTime() + 3000))
    expect(src.changedPaths).toHaveBeenCalledWith("11")

    // The same-sync reads are reused by the scope check (a second call would fail here).
    expect(first.read.get("11")).toEqual({ paths: ["app/src/services/dev-work/a.ts", "README.md"], complete: true })

    // Closed: cleared.
    // Closed: the sync writes the link's state first (writeLinks), then this step clears the stored files.
    await prisma.gitLink.updateMany({ where: { repositoryId: ids.repo, ref: "11" }, data: { state: "merged" } })
    const closed = await refreshChangedPaths(src, repo, [{ ref: "11", state: "merged" }], new Date(now.getTime() + 4000))
    expect(closed.changed).toBe(1)
    expect((await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repo, ref: "11" } })).changedPaths).toBeNull()
  })

  it("declare_scope and the screens warn that another PBI's open MR already changes files of the scope; predictions too", async () => {
    const dev = await import("../dev-work.service")
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.workClaim.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitLink.createMany({
      data: [
        link("21", ids.pbiB, { changedPaths: ["app/src/services/dev-work/dev-work.service.ts"], changedPathsComplete: true, changedPathsAt: now, author: "Synthetic B" }),
        link("22", ids.pbiA, {
          sourceBranch: "feature/PBI-1",
          mergeStatusAt: now,
          mergeBlockers: [{ reason: "approvals_missing", detail: "required=2 counted=1" }],
          conflictPrediction: { status: "scanned", stale: false, scannedAt: null, peers: [{ iid: 21, draft: false, outcome: "conflict", files: 2, truncated: false }] },
        }),
      ],
    })
    const actor = { userId: ids.userA, userName: "Synthetic A", systemRole: "member" as const }
    const { claim } = await dev.claimWork(ids.project, { pbi: ids.pbiA, sessionId: "s-a2", branch: "feature/PBI-1" }, actor)
    const declared = await dev.declareScope(ids.project, claim.id, { scope: [{ kind: "path", value: "app/src/services/dev-work" }] }, actor)
    expect(declared.mergeRequests?.mergeRequestOverlaps).toEqual([expect.objectContaining({ ref: "21", pbis: [2], count: 1 })])
    expect(declared.mergeRequests?.predictedConflicts).toEqual([expect.objectContaining({ ref: "22", files: 2, peer: expect.objectContaining({ ref: "21", pbis: [2] }) })])

    const board = await dev.listBoardClaims(ids.project, { pbi: ids.pbiA })
    expect(board.data[0]?.mergeRequests?.mergeRequestOverlaps[0]?.ref).toBe("21")
    const list = await dev.listClaims(ids.project, {}, ids.userA, new Date(), { hideConfidential: true })
    expect(list.data[0]?.mergeRequests?.mergeRequestOverlaps[0]?.ref).toBe("21")

    // PBI 2 becomes confidential: token answers drop its MR, screens keep it.
    await prisma.productBacklogItem.update({ where: { id: ids.pbiB }, data: { confidential: true } })
    const hidden = await dev.listClaims(ids.project, {}, ids.userA, new Date(), { hideConfidential: true })
    expect(hidden.data[0]?.mergeRequests?.mergeRequestOverlaps ?? []).toEqual([])
    expect(hidden.data[0]?.mergeRequests?.predictedConflicts[0]?.peer).toBeNull()
    expect((await dev.listBoardClaims(ids.project, { pbi: ids.pbiA })).data[0]?.mergeRequests?.mergeRequestOverlaps).toHaveLength(1)
    await prisma.productBacklogItem.update({ where: { id: ids.pbiB }, data: { confidential: false } })
  })

  it("the development copy (get_pbi / start_work), the chat's merge status and 自分の MR で止まっているもの", async () => {
    const { pbiDevelopment } = await import("../dev-work.start")
    const dev = await pbiDevelopment(ids.project, { id: ids.pbiA, displayId: 1, initiative: "synthetic A", epic: null })
    expect(dev).toMatchObject({ enabled: true, provider: "gitstation", pbiKey: "PBI-1", repositories: [expect.objectContaining({ name: "app", path: "g/app" })] })
    expect(dev.mergeRequests).toEqual([expect.objectContaining({ ref: "22", merge: expect.objectContaining({ blockers: [{ reason: "approvals_missing", detail: "required=2 counted=1" }] }) })])

    const { gitStatusHandlers } = await import("@/lib/git-status-tools")
    const text = await gitStatusHandlers.get_merge_status({ projectId: ids.project, args: { pbi: "PBI-1" } })
    expect(text).toContain("!22")
    expect(text).toContain("approvals_missing (approvals 1/2) → approvers")
    expect(text).toContain("predicted conflicts: !21 (2 files)")
    const all = await gitStatusHandlers.get_merge_status({ projectId: ids.project, args: {} })
    expect(all).toContain("!22")
    expect(all).not.toContain("!21 [")

    const { getMyBlockedMrs } = await import("@/services/git/my-blocked-mrs.service")
    // User A: !22 is on the branch of their claim. User B: author of !21, which nothing blocks (not listed).
    expect((await getMyBlockedMrs(ids.project, ids.userA)).items).toEqual([expect.objectContaining({ iid: "22", mine: "branch", pbiKey: "PBI-1" })])
    expect((await getMyBlockedMrs(ids.project, ids.userB)).items).toEqual([])
  })
})

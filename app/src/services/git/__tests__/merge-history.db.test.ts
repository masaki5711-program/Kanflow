import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * マージの履歴 (N11) against a REAL PostgreSQL. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_*
 * point at a migrated, disposable test database (synthetic rows only, removed afterwards), e.g. a
 * database of ops/test-env/compose.yml:
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/git/__tests__/merge-history.db.test.ts
 *
 * What it pins: one item per merge request (not per PBI link), newest merge first, a stable order
 * for merges of the same instant, pages that neither repeat nor lose a merge request, the period
 * and repository filters, and what is left out (not merged, another project, a deleted PBI,
 * integration off). Grouping and the keyset run in SQL, so only a real database proves them.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("merge history on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `n11test-${Date.now().toString(36)}`
  const ids = {
    project: `${tag}-p`,
    other: `${tag}-q`,
    repoA: `${tag}-ra`,
    repoB: `${tag}-rb`,
    repoOther: `${tag}-rq`,
    pbi1: `${tag}-b1`,
    pbi2: `${tag}-b2`,
    pbi3: `${tag}-b3`,
    foreign: `${tag}-b9`,
  }
  const projects = [ids.project, ids.other]
  const pbiIds = [ids.pbi1, ids.pbi2, ids.pbi3, ids.foreign]
  const HOST = "https://gitlab-mergehist.example"
  const T0 = new Date("2026-10-01T00:00:00.000Z")
  const day = (n: number, ms = 0) => new Date(T0.getTime() + n * 86_400_000 + ms)

  let prisma: typeof import("@/lib/prisma").prisma
  let history: typeof import("../merge-history.service")

  interface LinkOver {
    repositoryId?: string
    projectId?: string
    state?: string
    mergedAt?: Date | null
    openedAt?: Date | null
    occurredAt?: Date
    title?: string
    author?: string | null
    mergedBy?: string | null
    sourceBranch?: string | null
    targetBranch?: string | null
    declaredAt?: Date | null
  }
  /** A link as the sync stores it for one merge request and one PBI. */
  const link = (iid: number, pbiId: string, over: LinkOver = {}) => {
    const repositoryId = over.repositoryId ?? ids.repoA
    return prisma.gitLink.create({
      data: {
        projectId: ids.project,
        backlogItemId: pbiId,
        kind: "mr",
        ref: String(iid),
        title: `synthetic MR ${iid}`,
        url: `${HOST}/g/a/-/merge_requests/${iid}`,
        state: "merged",
        occurredAt: over.mergedAt ?? T0,
        mergedAt: day(iid),
        ...over,
        repositoryId,
      },
    })
  }
  const query = (over: Partial<import("../merge-history.service").MergeHistoryQuery> = {}) => history.getMergeHistory(ids.project, { limit: 25, ...over })
  const refs = (dto: import("../merge-history.service").MergeHistoryDto) => dto.items.map((i) => `${i.repository.name}!${i.ref}`)

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    history = await import("../merge-history.service")
    for (const id of projects) await prisma.project.create({ data: { id, name: id } })
    await prisma.gitIntegration.create({ data: { projectId: ids.project, enabled: true, provider: "gitlab" } })
    await prisma.gitIntegration.create({ data: { projectId: ids.other, enabled: true, provider: "gitlab" } })
    await prisma.productBacklogItem.createMany({
      data: [
        { id: ids.pbi1, projectId: ids.project, displayId: 1, initiative: "synthetic one" },
        { id: ids.pbi2, projectId: ids.project, displayId: 2, initiative: "", userStory: "synthetic story two" },
        { id: ids.pbi3, projectId: ids.project, displayId: 3, initiative: "synthetic three" },
        { id: ids.foreign, projectId: ids.other, displayId: 9, initiative: "synthetic foreign" },
      ],
    })
    const repo = (id: string, projectId: string, name: string, sortOrder: number) => ({ id, projectId, name, webUrl: `${HOST}/${name}`, apiBase: HOST, repoPath: name, sortOrder })
    await prisma.gitRepository.createMany({ data: [repo(ids.repoA, ids.project, "g/a", 0), repo(ids.repoB, ids.project, "g/b", 1), repo(ids.repoOther, ids.other, "g/q", 0)] })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.gitLink.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.gitRepository.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.productBacklogItem.deleteMany({ where: { id: { in: pbiIds } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
  })

  beforeEach(async () => {
    await prisma.gitLink.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.productBacklogItem.updateMany({ where: { id: { in: pbiIds } }, data: { deletedAt: null } })
    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { enabled: true } })
  })

  it("lists merged merge requests newest first, one item per merge request with every PBI it is linked to", async () => {
    await link(1, ids.pbi1, { author: "Alice", mergedBy: "Bob", sourceBranch: "feature/PBI-1-x", targetBranch: "main", openedAt: day(0) })
    // One merge request, two PBIs: two rows written by different syncs (the later row knows less).
    await link(2, ids.pbi2, { title: "old title", occurredAt: day(2), mergedAt: day(2, 500), openedAt: day(1, 500), author: "Carol", mergedBy: "Dana", targetBranch: "release/1" })
    await link(2, ids.pbi1, { title: "new title", occurredAt: day(3), mergedAt: day(2), openedAt: day(1), author: null, mergedBy: null, targetBranch: null, sourceBranch: "feature/two" })
    await link(3, ids.pbi3, { repositoryId: ids.repoB })

    const dto = await query()
    expect(dto.enabled).toBe(true)
    expect(dto.nextCursor).toBeNull()
    expect(refs(dto)).toEqual(["g/b!3", "g/a!2", "g/a!1"])
    expect(dto.items[1]).toEqual({
      id: `${ids.repoA}:2`,
      ref: "2",
      title: "new title", // the row that changed last
      url: `${HOST}/g/a/-/merge_requests/2`,
      mergedAt: day(2).toISOString(), // the earliest merge time of its rows
      openedAt: day(1).toISOString(),
      author: "Carol", // unknown on the newer row: the known value is shown
      mergedBy: "Dana",
      sourceBranch: "feature/two",
      targetBranch: "release/1",
      repository: { id: ids.repoA, name: "g/a" },
      pbis: [
        { id: ids.pbi1, displayId: 1, title: "synthetic one" },
        { id: ids.pbi2, displayId: 2, title: "synthetic story two" },
      ],
    })
    expect(dto.items[2]).toMatchObject({ author: "Alice", mergedBy: "Bob", sourceBranch: "feature/PBI-1-x", targetBranch: "main", openedAt: day(0).toISOString() })
    // Never recorded: unknown stays null (shown as "—"), not a guess.
    expect(dto.items[0]).toMatchObject({ author: null, mergedBy: null, sourceBranch: null, targetBranch: null, openedAt: null })
  })

  it("leaves out what is not a merge of this project's live PBIs", async () => {
    await link(1, ids.pbi1)
    await link(2, ids.pbi1, { state: "opened", mergedAt: null })
    await link(3, ids.pbi1, { state: "closed", mergedAt: null })
    await link(4, ids.pbi1, { state: "merged", mergedAt: null }) // merged, time not known yet
    await prisma.gitLink.create({ data: { projectId: ids.project, repositoryId: ids.repoA, backlogItemId: ids.pbi1, kind: "branch", ref: "feature/PBI-1-x", title: "b", url: `${HOST}/b`, occurredAt: T0, mergedAt: day(5) } })
    await prisma.gitLink.create({ data: { projectId: ids.other, repositoryId: ids.repoOther, backlogItemId: ids.foreign, kind: "mr", ref: "6", title: "foreign", url: `${HOST}/q/6`, state: "merged", occurredAt: T0, mergedAt: day(6) } })
    // A merge request of two PBIs, one deleted: shown with the live PBI only; of a deleted PBI alone: not shown.
    await link(7, ids.pbi2)
    await link(7, ids.pbi3)
    await link(8, ids.pbi3)
    await prisma.productBacklogItem.update({ where: { id: ids.pbi3 }, data: { deletedAt: new Date() } })

    const dto = await query()
    expect(refs(dto)).toEqual(["g/a!7", "g/a!1"])
    expect(dto.items[0].pbis.map((p) => p.displayId)).toEqual([2])
  })

  it("a link a developer declared is part of the history (a display, not delivery evidence)", async () => {
    await link(1, ids.pbi1, { declaredAt: T0 })
    expect(refs(await query())).toEqual(["g/a!1"])
  })

  it("pages neither repeat nor lose a merge request, also when several were merged at the same instant", async () => {
    const same = day(10)
    for (const iid of [1, 2, 3]) await link(iid, ids.pbi1, { mergedAt: same })
    for (const iid of [1, 2]) await link(iid, ids.pbi2, { repositoryId: ids.repoB, mergedAt: same })
    await link(4, ids.pbi1, { mergedAt: day(11) })
    await link(4, ids.pbi2, { mergedAt: day(11) }) // a second PBI must not take a second place on a page
    await link(5, ids.pbi1, { mergedAt: day(9) })

    const all = refs(await query())
    expect(all).toHaveLength(7)
    expect(all[0]).toBe("g/a!4")
    expect(all[6]).toBe("g/a!5")

    const paged: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await query({ limit: 2, cursor })
      expect(page.items.length).toBeLessThanOrEqual(2)
      paged.push(...refs(page))
      cursor = page.nextCursor ?? undefined
      pages++
    } while (cursor && pages < 10)
    expect(paged).toEqual(all)
    expect(pages).toBe(4)
  })

  it("the last full page has no next cursor only when nothing follows", async () => {
    for (const iid of [1, 2]) await link(iid, ids.pbi1)
    const exact = await query({ limit: 2 })
    expect(exact.items).toHaveLength(2)
    expect(exact.nextCursor).toBeNull()
    const first = await query({ limit: 1 })
    expect(first.nextCursor).not.toBeNull()
    const second = await query({ limit: 1, cursor: first.nextCursor! })
    expect(refs(second)).toEqual(["g/a!1"])
    expect(second.nextCursor).toBeNull()
  })

  it("filters by period (from inclusive, to exclusive) and by repository", async () => {
    for (const iid of [1, 2, 3, 4]) await link(iid, ids.pbi1)
    await link(3, ids.pbi2, { repositoryId: ids.repoB })
    expect(refs(await query({ from: day(2).toISOString(), to: day(4).toISOString() }))).toEqual(["g/b!3", "g/a!3", "g/a!2"])
    expect(refs(await query({ from: day(4).toISOString() }))).toEqual(["g/a!4"])
    expect(refs(await query({ to: day(1).toISOString() }))).toEqual([])
    expect(refs(await query({ repositoryId: ids.repoB }))).toEqual(["g/b!3"])
    // A repository of another project names nothing here.
    expect(refs(await query({ repositoryId: ids.repoOther }))).toEqual([])
    // The period also holds across pages.
    const first = await query({ from: day(2).toISOString(), limit: 2 })
    expect(refs(await query({ from: day(2).toISOString(), limit: 2, cursor: first.nextCursor! }))).toEqual(["g/a!3", "g/a!2"])
  })

  it("an offset in the period is honoured (the same instant, however it is written)", async () => {
    await link(1, ids.pbi1, { mergedAt: new Date("2026-10-05T00:30:00.000Z") })
    expect(refs(await query({ from: "2026-10-05T09:00:00+09:00" }))).toEqual(["g/a!1"])
    expect(refs(await query({ from: "2026-10-05T10:00:00+09:00" }))).toEqual([])
  })

  it("a cursor this code did not issue is refused (400), never read as the first page", async () => {
    await link(1, ids.pbi1)
    for (const cursor of ["not-a-cursor", Buffer.from('{"t":"yesterday","r":"x","f":"1"}').toString("base64url"), Buffer.from("[]").toString("base64url")]) {
      await expect(query({ cursor })).rejects.toMatchObject({ status: 400, code: "VALIDATION" })
    }
  })

  it("answers { enabled: false } without rows while the integration is off", async () => {
    await link(1, ids.pbi1)
    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { enabled: false } })
    expect(await query()).toEqual({ enabled: false, items: [], nextCursor: null })
  })
})

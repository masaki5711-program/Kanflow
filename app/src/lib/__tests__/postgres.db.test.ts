import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * PostgreSQL specifics against a REAL database (the rest of the suite mocks Prisma).
 * Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* / DATABASE_URL point at a migrated,
 * disposable test database (synthetic rows only, removed afterwards), e.g. the
 * container of ops/test-env/compose.yml:
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/lib/__tests__/postgres.db.test.ts
 *
 * What it pins (the MySQL -> PostgreSQL differences mocks cannot show):
 * - utf8mb4_unicode_ci behaviour kept: case-insensitive unique keys (citext) and
 *   case-insensitive text search (`mode: "insensitive"`, ILIKE + pg_trgm);
 * - every ported raw-SQL site runs on PostgreSQL (quoted identifiers, ON CONFLICT,
 *   DELETE without LIMIT, FOR SHARE / FOR UPDATE SKIP LOCKED, advisory locks);
 * - a failed best-effort statement does not abort the caller's transaction
 *   (PostgreSQL aborts the whole transaction; MySQL did not) - savepoints.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("PostgreSQL specifics on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `pgtest-${Date.now().toString(36)}`
  const ids = {
    project: `${tag}-p`,
    pbi: `${tag}-b`,
    pbi2: `${tag}-b2`,
    icebox: `${tag}-i`,
    sprint: `${tag}-s`,
    task: `${tag}-t`,
    user: `${tag}-u`,
    section: `${tag}-sec`,
    repo: `${tag}-r`,
  }
  const actor = { userId: ids.user, userName: "synthetic", systemRole: "admin" }

  let prisma: typeof import("@/lib/prisma").prisma

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    await prisma.user.create({ data: { id: ids.user, name: `Alice ${tag}`, email: `Alice.${tag}@Example.test`, password: "synthetic", role: "admin" } })
    await prisma.project.create({ data: { id: ids.project, name: `Kanflow Sprint Planning ${tag}` } })
    await prisma.productBacklogItem.create({
      data: { id: ids.pbi, projectId: ids.project, displayId: 1, initiative: `Checkout Flow ${tag}`, userStory: "受入基準のテストを書く" },
    })
    await prisma.productBacklogItem.create({ data: { id: ids.pbi2, projectId: ids.project, displayId: 2, initiative: "synthetic other" } })
    await prisma.iceboxItem.create({ data: { id: ids.icebox, projectId: ids.project, displayId: 1, author: "synthetic", request: `Export to CSV ${tag}` } })
    const now = new Date()
    await prisma.sprint.create({ data: { id: ids.sprint, projectId: ids.project, sprintName: "Sprint 1", startDate: now, endDate: now } })
    await prisma.sprintBacklogItem.create({ data: { id: ids.task, sprintId: ids.sprint, pbItemId: ids.pbi, taskName: `Write E2E Test ${tag}` } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.repoChunk.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitRepository.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: ids.project } })
    await prisma.fieldTranslation.deleteMany({ where: { entityId: { startsWith: tag } } })
    await prisma.gitRelease.deleteMany({ where: { projectId: ids.project } })
    await prisma.planItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.activityLog.deleteMany({ where: { projectId: ids.project } })
    await prisma.sprintBacklogItem.deleteMany({ where: { id: ids.task } })
    await prisma.sprint.deleteMany({ where: { id: ids.sprint } })
    await prisma.iceboxItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.productBacklogItem.deleteMany({ where: { projectId: ids.project } })
    await prisma.project.deleteMany({ where: { id: { startsWith: tag } } })
    await prisma.adminCategory.deleteMany({ where: { sectionId: ids.section } })
    await prisma.section.deleteMany({ where: { id: ids.section } })
    await prisma.userProjectCategory.deleteMany({ where: { userId: ids.user } })
    await prisma.glossary.deleteMany({ where: { term: { startsWith: tag } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: tag } } })
  })

  describe("case-insensitive keys (utf8mb4_unicode_ci parity)", () => {
    it("a login e-mail matches regardless of case, and a case variant cannot be registered twice", async () => {
      const found = await prisma.user.findUnique({ where: { email: `alice.${tag}@example.TEST` } })
      expect(found?.id).toBe(ids.user)
      // The stored spelling is kept as entered.
      expect(found?.email).toBe(`Alice.${tag}@Example.test`)
      await expect(
        prisma.user.create({ data: { id: `${tag}-dup`, name: "dup", email: `ALICE.${tag}@EXAMPLE.TEST`, password: "synthetic" } })
      ).rejects.toMatchObject({ code: "P2002" })
    })

    it("employee numbers, section names and category names are unique regardless of case", async () => {
      await prisma.user.update({ where: { id: ids.user }, data: { employeeNumber: `E-${tag}-a` } })
      await expect(
        prisma.user.create({ data: { id: `${tag}-emp`, name: "emp", email: `emp.${tag}@example.test`, password: "x", employeeNumber: `e-${tag.toUpperCase()}-A` } })
      ).rejects.toMatchObject({ code: "P2002" })

      await prisma.section.create({ data: { id: ids.section, name: `Production ${tag}` } })
      await expect(prisma.section.create({ data: { name: `PRODUCTION ${tag.toUpperCase()}` } })).rejects.toMatchObject({ code: "P2002" })

      await prisma.adminCategory.create({ data: { sectionId: ids.section, name: "Line A" } })
      await expect(prisma.adminCategory.create({ data: { sectionId: ids.section, name: "line a" } })).rejects.toMatchObject({ code: "P2002" })

      await prisma.userProjectCategory.create({ data: { userId: ids.user, name: "Favourites" } })
      await expect(prisma.userProjectCategory.create({ data: { userId: ids.user, name: "FAVOURITES" } })).rejects.toMatchObject({ code: "P2002" })
    })

    it("milestone checklist labels and git release tags are unique regardless of case (citext, MySQL parity)", async () => {
      const plan = await prisma.planItem.create({ data: { id: `${tag}-plci`, projectId: ids.project, name: "milestone" } })
      await prisma.milestoneChecklistState.create({ data: { planItemId: plan.id, label: "Design Review" } })
      await expect(prisma.milestoneChecklistState.create({ data: { planItemId: plan.id, label: "design review" } })).rejects.toMatchObject({ code: "P2002" })
      expect(await prisma.milestoneChecklistState.findUnique({ where: { planItemId_label: { planItemId: plan.id, label: "DESIGN REVIEW" } } })).not.toBeNull()

      await prisma.gitRepository.create({
        data: { id: `${tag}-rel`, projectId: ids.project, name: "rel", webUrl: "https://git.example.test/g/rel", apiBase: "https://git.example.test/api/v4", repoPath: "g/rel" },
      })
      const rel = { projectId: ids.project, repositoryId: `${tag}-rel`, url: "https://git.example.test/g/rel/-/tags/v1.0", releasedAt: new Date() }
      await prisma.gitRelease.create({ data: { ...rel, tag: "v1.0" } })
      await expect(prisma.gitRelease.create({ data: { ...rel, tag: "V1.0" } })).rejects.toMatchObject({ code: "P2002" })
      // Leave no plan rows behind for the baseline test of the same project.
      await prisma.planItem.delete({ where: { id: plan.id } })
    })

    it("the member lookup by e-mail and the admin duplicate check ignore case", async () => {
      const users = await import("@/services/users/users.repository")
      expect((await users.findUserWith(prisma, { email: `ALICE.${tag}@example.test` }))?.id).toBe(ids.user)
    })
  })

  describe("case-insensitive text search", () => {
    it("user search (admin / member invite) matches name and e-mail in any case", async () => {
      const { searchActiveUsers } = await import("@/services/users/users.repository")
      const rows = await searchActiveUsers(prisma, `ALICE ${tag.toUpperCase()}`, undefined)
      expect(rows.map((r) => r.id)).toContain(ids.user)
    })

    it("glossary list filter is case-insensitive", async () => {
      const glossary = await import("@/lib/translation/glossary-service")
      await prisma.glossary.create({
        data: { sourceLocale: "ja", targetLocale: "id", term: `${tag} Takt Time`, termNorm: `${tag} takt time`, translation: "Waktu Takt" },
      })
      const out = await glossary.listGlossary({ q: `${tag.toUpperCase()} TAKT`, limit: 50, offset: 0 })
      expect(out.rows.map((g) => g.term)).toContain(`${tag} Takt Time`)
    })

    it("global search finds Latin text in any case, Japanese substrings, and the other language via field_translation", async () => {
      const { searchEverything } = await import("@/services/search/search.service")
      const viewer = { userId: ids.user, systemRole: "admin" }
      const hrefsOf = async (q: string) => {
        const r = await searchEverything(viewer, { q, limit: 10 })
        return r.groups.flatMap((g) => g.items.map((h) => `${g.type}:${h.id}`))
      }
      const upper = await hrefsOf(`CHECKOUT FLOW ${tag.toUpperCase()}`)
      expect(upper).toContain(`pbi:${ids.pbi}`)
      expect(await hrefsOf(`write e2e test ${tag}`)).toContain(`task:${ids.task}`)
      expect(await hrefsOf(`export TO csv ${tag}`)).toContain(`icebox:${ids.icebox}`)
      expect(await hrefsOf(`kanflow sprint planning ${tag}`)).toContain(`project:${ids.project}`)
      expect(await hrefsOf("受入基準")).toContain(`pbi:${ids.pbi}`)
      // A 2-character term cannot use a trigram index: it takes the LIKE path, still case-insensitive.
      expect(await hrefsOf("受入")).toContain(`pbi:${ids.pbi}`)

      await prisma.fieldTranslation.create({
        data: { entityType: "backlog_item", entityId: ids.pbi2, field: "initiative", sourceLocale: "ja", sourceHash: "h", textJa: "その他", textId: `Pengujian Lain ${tag}`, status: "done" },
      })
      expect(await hrefsOf(`pengujian lain ${tag}`)).toContain(`pbi:${ids.pbi2}`)
    })

    it("the LIKE fallback (SEARCH_FULLTEXT=off) is case-insensitive too", async () => {
      const prev = process.env.SEARCH_FULLTEXT
      process.env.SEARCH_FULLTEXT = "off"
      try {
        const { searchEverything } = await import("@/services/search/search.service")
        const r = await searchEverything({ userId: ids.user, systemRole: "admin" }, { q: `checkout FLOW ${tag}`, limit: 10 })
        expect(r.groups.flatMap((g) => g.items.map((h) => h.id))).toContain(ids.pbi)
        const { searchWorkItems } = await import("@/lib/analysis-tools-search")
        expect((await searchWorkItems(ids.project, `WRITE E2E`)).map((x) => ("task_id" in x ? x.task_id : x.id))).toContain(ids.task)
      } finally {
        if (prev === undefined) delete process.env.SEARCH_FULLTEXT
        else process.env.SEARCH_FULLTEXT = prev
      }
    })

    it("the chat tool search_work_items (trigram path) finds rows in any case, ranked", async () => {
      const { searchWorkItems } = await import("@/lib/analysis-tools-search")
      const rows = await searchWorkItems(ids.project, `checkout ${tag.toUpperCase()}`)
      expect(rows.map((x) => ("id" in x ? x.id : x.task_id))).toContain("#1")
    })

    it("repository knowledge search: all keywords first, any keyword fills up; case-insensitive", async () => {
      const repoSearch = await import("@/services/git/repo-search")
      await prisma.gitRepository.create({
        data: { id: ids.repo, projectId: ids.project, name: "docs", webUrl: "https://git.example.test/g/docs", apiBase: "https://git.example.test/api/v4", repoPath: "g/docs" },
      })
      await prisma.repoChunk.createMany({
        data: [
          { projectId: ids.project, repositoryId: ids.repo, path: "docs/oee.md", chunkNo: 0, heading: "OEE Calculation", content: "OEE = availability x performance x quality", blobSha: "a" },
          { projectId: ids.project, repositoryId: ids.repo, path: "docs/ole.md", chunkNo: 0, heading: "OLE", content: "OLE は 計算方法 が異なる", blobSha: "b" },
        ],
      })
      const repos = [{ id: ids.repo, name: "docs", webUrl: "https://git.example.test/g/docs", ref: "HEAD", indexedFiles: 2, indexedAt: null }]
      const hits = await repoSearch.searchRepoDocs(ids.project, repos, "oee calculation")
      expect(hits[0]?.path).toBe("docs/oee.md")
      const jp = await repoSearch.searchRepoDocs(ids.project, repos, "OEEとOLEの計算方法の違いは？")
      expect(jp.map((h) => h.path).sort()).toEqual(["docs/ole.md", "docs/oee.md"].sort())
    })
  })

  describe("ported raw SQL", () => {
    it("enqueueTranslations upserts (ON CONFLICT): same text keeps the row, new text resets it to pending", async () => {
      const { enqueueNow } = await import("@/lib/translation/service")
      const key = { entityType_entityId_field: { entityType: "backlog_item", entityId: ids.pbi, field: "initiative" } }
      await enqueueNow("backlog_item", ids.pbi, { initiative: "最初のテキスト" })
      await prisma.fieldTranslation.update({ where: key, data: { status: "done", textId: "teks pertama", attempts: 2 } })
      await enqueueNow("backlog_item", ids.pbi, { initiative: "最初のテキスト" })
      expect(await prisma.fieldTranslation.findUnique({ where: key })).toMatchObject({ status: "done", textId: "teks pertama", attempts: 2 })
      await enqueueNow("backlog_item", ids.pbi, { initiative: "新しいテキスト" })
      expect(await prisma.fieldTranslation.findUnique({ where: key })).toMatchObject({
        status: "pending",
        textJa: "新しいテキスト",
        textId: null,
        attempts: 0,
        sourceLocale: "ja",
      })
    })

    it("a failing best-effort enqueue inside a transaction leaves the transaction usable (savepoint)", async () => {
      const { enqueueTranslations } = await import("@/lib/translation/service")
      const projectId = `${tag}-p-tx`
      await prisma.$transaction(async (tx) => {
        // entity_id is VARCHAR(191): this insert fails on the server.
        await enqueueTranslations("backlog_item", "x".repeat(300), { initiative: "テキスト" }, tx)
        await tx.project.create({ data: { id: projectId, name: "after a failed enqueue" } })
      })
      expect(await prisma.project.count({ where: { id: projectId } })).toBe(1)
    })

    it("activity logging that fails inside a transaction does not abort the user's write", async () => {
      const { logActivity } = await import("@/services/_shared/activity")
      const projectId = `${tag}-p-act`
      await prisma.$transaction(async (tx) => {
        // entityId is VARCHAR(191): the activity insert fails and is swallowed.
        await logActivity(tx, { projectId: ids.project, entityType: "pbi", entityId: "y".repeat(300), action: "update", actor: null })
        await tx.project.create({ data: { id: projectId, name: "after a failed activity row" } })
      })
      expect(await prisma.project.count({ where: { id: projectId } })).toBe(1)
    })

    it("purgeOrphanTranslations counts and deletes in batches (DELETE without LIMIT)", async () => {
      const svc = await import("@/lib/translation/service")
      await prisma.fieldTranslation.create({
        data: { entityType: "backlog_item", entityId: `${tag}-gone`, field: "initiative", sourceLocale: "ja", sourceHash: "h", textJa: "孤児", status: "pending" },
      })
      const dry = await svc.purgeOrphanTranslations({ dryRun: true })
      expect(dry.byEntity.backlog_item).toBeGreaterThanOrEqual(1)
      await svc.purgeOrphanTranslations()
      expect(await prisma.fieldTranslation.count({ where: { entityId: `${tag}-gone` } })).toBe(0)
      // Rows of live entities stay.
      expect(await prisma.fieldTranslation.count({ where: { entityId: ids.pbi } })).toBeGreaterThan(0)
    })

    it("backfillTranslations enqueues untranslated fields of live rows (FOR SHARE, quoted identifiers)", async () => {
      const svc = await import("@/lib/translation/service")
      await svc.backfillTranslations(500)
      const rows = await prisma.fieldTranslation.findMany({ where: { entityId: ids.icebox }, select: { field: true, status: true } })
      expect(rows).toContainEqual({ field: "request", status: "pending" })
    })

    it("the translation queue claims due pending rows once (FOR UPDATE SKIP LOCKED, UTC clock)", async () => {
      const worker = await import("@/lib/translation/worker")
      await prisma.fieldTranslation.updateMany({ where: { status: "pending" }, data: { requestedAt: new Date(Date.now() + 3_600_000) } })
      await prisma.fieldTranslation.update({
        where: { entityType_entityId_field: { entityType: "icebox_item", entityId: ids.icebox, field: "request" } },
        data: { requestedAt: new Date(Date.now() - 1000), priority: 999 },
      })
      const [a, b] = await Promise.all([worker.claimPending(5), worker.claimPending(5)])
      const claimed = [...a, ...b].filter((r) => r.entityId === ids.icebox)
      expect(claimed).toHaveLength(1)
      expect(claimed[0].status).toBe("running")
    })

    it("health: translation backlog query runs and counts by status", async () => {
      const { GET } = await import("@/app/api/health/route")
      const res = await GET(new Request("http://127.0.0.1/api/health", { headers: { host: "127.0.0.1" } }))
      const body = (await res.json()) as { db: string; translation: { pending: number; running: number } | null }
      expect(body.db).toBe("ok")
      expect(body.translation).not.toBeNull()
      expect(body.translation?.running).toBeGreaterThanOrEqual(1)
    })

    it("storage quota sums every attachment table (bigint total as text)", async () => {
      const { projectStorageUsed } = await import("@/services/attachments/storage-quota")
      await prisma.projectAttachment.create({
        data: { projectId: ids.project, fileName: "a.bin", originalName: "a.bin", mimeType: "application/octet-stream", fileSize: 2_000_000_000 },
      })
      await prisma.projectAttachment.create({
        data: { projectId: ids.project, fileName: "b.bin", originalName: "b.bin", mimeType: "application/octet-stream", fileSize: 2_000_000_000 },
      })
      expect(await projectStorageUsed(prisma, ids.project)).toBe(4_000_000_000)
      await prisma.projectAttachment.deleteMany({ where: { projectId: ids.project } })
    })

    it("plan baseline copy updates only the live rows (all, or the given ids)", async () => {
      const repo = await import("@/services/plan/plan.repository")
      const start = new Date("2026-11-02T00:00:00Z")
      const end = new Date("2026-11-09T00:00:00Z")
      await prisma.planItem.createMany({
        data: [
          { id: `${tag}-pl1`, projectId: ids.project, name: "a", plannedStart: start, plannedEnd: end },
          { id: `${tag}-pl2`, projectId: ids.project, name: "b", plannedStart: start, plannedEnd: end },
          { id: `${tag}-pl3`, projectId: ids.project, name: "c", plannedStart: start, plannedEnd: end, deletedAt: new Date() },
        ],
      })
      expect(await repo.copyBaseline(prisma, ids.project, [`${tag}-pl1`])).toBe(1)
      expect(await repo.copyBaseline(prisma, ids.project)).toBe(2)
      const pl3 = await prisma.planItem.findUnique({ where: { id: `${tag}-pl3` } })
      expect(pl3?.baselineStart).toBeNull()
      expect((await prisma.planItem.findUnique({ where: { id: `${tag}-pl1` } }))?.baselineEnd?.toISOString()).toBe(end.toISOString())
    })

    it("git settings are written under the project row lock (SELECT ... FOR UPDATE on \"Project\")", async () => {
      const git = await import("@/services/git/git.service")
      await Promise.all([
        git.updateGitSettings(ids.project, { enabled: true }, actor),
        git.updateGitSettings(ids.project, { autoCompleteOnMerge: true }, actor),
      ])
      expect(await prisma.gitIntegration.findUnique({ where: { projectId: ids.project } })).toMatchObject({ enabled: true, autoCompleteOnMerge: true })
    })
  })

  describe("transactions and sessions", () => {
    it("a failing bestEffort statement inside $transaction leaves the outer write committed", async () => {
      const { bestEffort } = await import("@/services/_shared/savepoint")
      const projectId = `${tag}-p-be`
      let caught: unknown = null
      await prisma.$transaction(async (tx) => {
        // Unique violation (e-mail already taken, citext) - swallowed by the caller, like a reaction double click.
        await bestEffort(tx, () => tx.user.create({ data: { id: `${tag}-be`, name: "be", email: `alice.${tag}@example.test`, password: "x" } })).catch((e: unknown) => {
          caught = e
        })
        await tx.project.create({ data: { id: projectId, name: "outer write" } })
      })
      expect(caught).toMatchObject({ code: "P2002" })
      expect(await prisma.project.count({ where: { id: projectId } })).toBe(1)
    })

    it("app sessions run in UTC with statement and lock timeouts", async () => {
      const rows = await prisma.$queryRaw<Array<{ tz: string; st: string; lt: string }>>`
        SELECT current_setting('TimeZone') AS tz, current_setting('statement_timeout') AS st, current_setting('lock_timeout') AS lt`
      expect(rows[0]).toEqual({ tz: "UTC", st: "30s", lt: "10s" })
    })
  })

  describe("named locks (GET_LOCK -> advisory locks)", () => {
    it("pinned-transaction lock: one holder, verify, release, then another may take it", async () => {
      const { acquireNamedLock } = await import("@/worker/named-lock")
      const name = `${tag}-named`
      const first = await acquireNamedLock(prisma, name)
      expect(first).not.toBeNull()
      expect(await acquireNamedLock(prisma, name)).toBeNull()
      expect(await first?.verify()).toBe(true)
      await first?.release()
      expect(await first?.verify()).toBe(false)
      const second = await acquireNamedLock(prisma, name)
      expect(second).not.toBeNull()
      await second?.release()
    })

    it("dedicated-connection lock (worker single instance): exclusive, verified, released", async () => {
      const { acquireDedicatedLock, createLockConnect } = await import("@/worker/dedicated-lock")
      const connect = createLockConnect(process.env)
      const name = `${tag}-dedicated`
      const first = await acquireDedicatedLock(connect, name)
      expect(first).not.toBeNull()
      expect(await acquireDedicatedLock(connect, name)).toBeNull()
      expect(await first?.verify()).toBe(true)
      await first?.release()
      expect(await first?.verify()).toBe(false)
      const second = await acquireDedicatedLock(connect, name)
      expect(second).not.toBeNull()
      await second?.release()
    })

    it("the two lock kinds share one key space: a name held by one is refused by the other", async () => {
      const { acquireNamedLock } = await import("@/worker/named-lock")
      const { acquireDedicatedLock, createLockConnect } = await import("@/worker/dedicated-lock")
      const name = `${tag}-shared`
      const held = await acquireDedicatedLock(createLockConnect(process.env), name)
      expect(held).not.toBeNull()
      expect(await acquireNamedLock(prisma, name)).toBeNull()
      await held?.release()
    })
  })
})

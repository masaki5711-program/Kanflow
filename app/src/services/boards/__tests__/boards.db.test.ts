import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * ボード against a REAL PostgreSQL (the route tests run on an in-memory repository).
 * Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database
 * (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/boards/__tests__/boards.db.test.ts
 *
 * Checks what only the database can show: the sheet row lock gives concurrent writers distinct
 * revisions and no lost element, the merge rule holds between them, jsonb keeps an unknown element
 * as sent, the board row lock keeps the sheet rules (at most N, at least one) under concurrency, and
 * the constraints / cascades of the migration.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("boards on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `boardtest-${Date.now().toString(36)}`
  const projectId = `${tag}-p`
  const actor = { userId: `${tag}-u`, userName: "synthetic", systemRole: "member" }
  const rect = (x: number, extra: Record<string, unknown> = {}) => ({ type: "rect", x, y: 0, w: 100, h: 60, z: 1, text: "", fill: "white", stroke: "ink", ...extra })

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../boards.service")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../boards.service")
    await prisma.user.create({ data: { id: actor.userId, name: actor.userId, email: `${actor.userId}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: projectId, name: tag } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.board.deleteMany({ where: { projectId } })
    await prisma.project.deleteMany({ where: { id: projectId } })
    await prisma.user.deleteMany({ where: { id: actor.userId } })
  })

  it("a new board has one sheet at revision 0 and no elements", async () => {
    const board = await svc.createBoard(projectId, { title: "synthetic board" }, actor)
    expect(board.sheets).toHaveLength(1)
    expect(board.sheets[0]).toMatchObject({ rev: 0 })
    expect(await svc.readElements(projectId, board.id, board.sheets[0].id)).toEqual({ rev: 0, full: true, elements: [] })
    expect(await svc.readElements(projectId, board.id, board.sheets[0].id, 0)).toEqual({ rev: 0, full: false, elements: [] })
  })

  it("eight concurrent writers of different elements get revisions 1..8 and nothing is lost", async () => {
    const board = await svc.createBoard(projectId, { title: "concurrent" }, actor)
    const sheetId = board.sheets[0].id
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: `el-w${i}-0001`, version: 1, deleted: false, data: rect(i) }] }, actor))
    )
    expect(results.map((r) => r.rev).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(results.every((r) => r.applied === 1 && r.stale.length === 0)).toBe(true)

    const all = await svc.readElements(projectId, board.id, sheetId)
    expect(all.rev).toBe(8)
    expect(all.elements.map((e) => e.id).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `el-w${i}-0001`))

    // A reader that has revision 5 gets exactly the three later writes.
    const delta = await svc.readElements(projectId, board.id, sheetId, 5)
    expect(delta).toMatchObject({ rev: 8, full: false })
    expect(delta.elements).toHaveLength(3)
  })

  it("concurrent writers of the same element: the highest version stays, the others are told", async () => {
    const board = await svc.createBoard(projectId, { title: "same element" }, actor)
    const sheetId = board.sheets[0].id
    const versions = [3, 1, 5, 2, 4]
    const results = await Promise.all(
      versions.map((version) => svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-shared-01", version, deleted: false, data: rect(version) }] }, actor))
    )
    const stored = await prisma.boardElement.findMany({ where: { sheetId, elementId: "el-shared-01" } })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ version: 5, deleted: false, updatedById: actor.userId })
    expect((stored[0].data as { x: number }).x).toBe(5)

    // Whoever was refused got the row that was stored at that moment, with a higher version than its own.
    results.forEach((r, i) => {
      if (r.applied === 1) return
      expect(r.stale).toHaveLength(1)
      expect(r.stale[0].version).toBeGreaterThan(versions[i])
    })
    expect(results.find((_, i) => versions[i] === 5)).toMatchObject({ applied: 1, stale: [] })
    // The sheet revision counts the writes that changed something, and the row carries the last one.
    const sheet = await prisma.boardSheet.findUniqueOrThrow({ where: { id: sheetId } })
    expect(sheet.rev).toBe(results.filter((r) => r.applied === 1).length)
    expect(stored[0].rev).toBe(results.find((_, i) => versions[i] === 5)?.rev)
  })

  it("rewriting an element keeps one row, its creation time, and moves it to the new revision", async () => {
    const board = await svc.createBoard(projectId, { title: "rewrite" }, actor)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-000001", version: 1, deleted: false, data: rect(1) }] }, actor)
    const before = await prisma.boardElement.findFirstOrThrow({ where: { sheetId, elementId: "el-000001" } })
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-000001", version: 2, deleted: false, data: rect(2) }] }, actor)
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-000001", version: 3, deleted: true }] }, actor)

    const rows = await prisma.boardElement.findMany({ where: { sheetId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ version: 3, deleted: true, rev: 3, data: {} })
    expect(rows[0].createdAt.getTime()).toBe(before.createdAt.getTime())

    expect(await svc.readElements(projectId, board.id, sheetId)).toEqual({ rev: 3, full: true, elements: [] })
    expect((await svc.readElements(projectId, board.id, sheetId, 2)).elements).toEqual([{ id: "el-000001", version: 3, deleted: true, data: {} }])
  })

  it("jsonb keeps an element of an unknown type as it was sent", async () => {
    const board = await svc.createBoard(projectId, { title: "unknown type" }, actor)
    const sheetId = board.sheets[0].id
    const image = { type: "image", fileId: "file-1", x: 5.5, y: -6, w: 320, h: 200, crop: { top: 0.1, nested: [1, "two", null, { deep: true }] }, caption: "合成データ — ±∞ 😀" }
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "img-000001", version: 1, deleted: false, data: image }] }, actor)
    const got = await svc.readElements(projectId, board.id, sheetId)
    expect(got.elements).toEqual([{ id: "img-000001", version: 1, deleted: false, data: image }])
  })

  it("a write of the largest size is stored in one transaction", async () => {
    const { BOARD_LIMITS } = await import("@/lib/board/limits")
    const board = await svc.createBoard(projectId, { title: "large write" }, actor)
    const sheetId = board.sheets[0].id
    const elements = Array.from({ length: BOARD_LIMITS.elementsPerWrite }, (_, i) => ({ id: `el-${String(i).padStart(6, "0")}`, version: 1, deleted: false as const, data: rect(i) }))
    expect(await svc.writeElements(projectId, board.id, sheetId, { elements }, actor)).toEqual({ rev: 1, applied: BOARD_LIMITS.elementsPerWrite, stale: [] })
    expect(await prisma.boardElement.count({ where: { sheetId, rev: 1 } })).toBe(BOARD_LIMITS.elementsPerWrite)

    // Duplicate: the copy has the same elements, fresh versions, and its own rows.
    const copy = await svc.duplicateSheet(projectId, board.id, sheetId, { name: "copy" }, actor)
    expect(copy.board.sheets.map((s) => s.id)).toEqual([sheetId, copy.sheetId])
    expect(await prisma.boardElement.count({ where: { sheetId: copy.sheetId, version: 1, rev: 1, deleted: false } })).toBe(BOARD_LIMITS.elementsPerWrite)
  })

  it("concurrent sheet changes keep the rules: never more than the limit, never zero", async () => {
    const { BOARD_LIMITS } = await import("@/lib/board/limits")
    const board = await svc.createBoard(projectId, { title: "sheet rules" }, actor)

    // Two sheets, two concurrent deletes: exactly one goes through.
    const second = await svc.addSheet(projectId, board.id, { name: "2" })
    const deletes = await Promise.allSettled([svc.deleteSheet(projectId, board.id, board.sheets[0].id), svc.deleteSheet(projectId, board.id, second.sheetId)])
    expect(deletes.filter((d) => d.status === "fulfilled")).toHaveLength(1)
    expect(deletes.find((d) => d.status === "rejected")).toMatchObject({ reason: { code: "BOARD_LAST_SHEET" } })
    expect(await prisma.boardSheet.count({ where: { boardId: board.id } })).toBe(1)

    // Fill up to one below the limit, then four concurrent adds: exactly one goes through.
    for (let i = 2; i < BOARD_LIMITS.sheetsPerBoard; i++) await svc.addSheet(projectId, board.id, { name: `s${i}` })
    const adds = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => svc.addSheet(projectId, board.id, { name: `race ${i}` })))
    expect(adds.filter((a) => a.status === "fulfilled")).toHaveLength(1)
    const sheets = await prisma.boardSheet.findMany({ where: { boardId: board.id }, orderBy: { sortOrder: "asc" } })
    expect(sheets).toHaveLength(BOARD_LIMITS.sheetsPerBoard)
    expect(sheets.map((s) => s.sortOrder)).toEqual(Array.from({ length: BOARD_LIMITS.sheetsPerBoard }, (_, i) => i))
  })

  it("element writes and sheet changes at the same time never deadlock (lock order board → sheet)", async () => {
    const board = await svc.createBoard(projectId, { title: "lock order" }, actor)
    const sheetId = board.sheets[0].id
    const work = Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0
        ? svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: `el-lock-${String(i).padStart(4, "0")}`, version: 1, deleted: false, data: rect(i) }] }, actor)
        : svc.renameSheet(projectId, board.id, sheetId, { name: `renamed ${i}` }),
    )
    const results = await Promise.allSettled(work)
    expect(results.filter((r) => r.status === "rejected")).toEqual([])
    expect(await prisma.boardElement.count({ where: { sheetId } })).toBe(6)
  })

  it("a version that jumps too far is refused (it would lock the element for everyone); one step at a time is fine", async () => {
    const { MAX_VERSION_STEP } = await import("@/lib/board/merge")
    const board = await svc.createBoard(projectId, { title: "version jump" }, actor)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-jump01", version: 1, deleted: false, data: rect(1) }] }, actor)
    await expect(
      svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-jump01", version: 2 + MAX_VERSION_STEP, deleted: false, data: rect(2) }] }, actor),
    ).rejects.toMatchObject({ code: "BOARD_VERSION_JUMP" })
    await expect(svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-jump01", version: 2, deleted: false, data: rect(2) }] }, actor)).resolves.toMatchObject({ applied: 1 })
  })

  it("deleting an element the server never saw leaves a tombstone: its late create stays gone", async () => {
    const board = await svc.createBoard(projectId, { title: "late create" }, actor)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-late01", version: 2, deleted: true }] }, actor)
    const late = await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-late01", version: 1, deleted: false, data: rect(1) }] }, actor)
    expect(late.applied).toBe(0)
    expect(await prisma.boardElement.findFirstOrThrow({ where: { sheetId, elementId: "el-late01" } })).toMatchObject({ deleted: true, version: 2 })
  })

  it("tombstones count against a sheet's stored rows (create-then-delete cannot grow the table without end)", async () => {
    const { BOARD_LIMITS } = await import("@/lib/board/limits")
    const board = await svc.createBoard(projectId, { title: "tombstones" }, actor)
    const sheetId = board.sheets[0].id
    const rows = Array.from({ length: BOARD_LIMITS.rowsPerSheet }, (_, i) => ({ sheetId, elementId: `el-t${String(i).padStart(6, "0")}`, version: 1, deleted: true, data: {}, rev: 1 }))
    await prisma.boardElement.createMany({ data: rows })
    await expect(svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-new0001", version: 1, deleted: false, data: rect(1) }] }, actor)).rejects.toMatchObject({ code: "BOARD_SHEET_FULL" })
  })

  it("image rows (B2) count against the project storage quota and go with the board", async () => {
    const repo = await import("../boards.repository")
    const { projectStorageUsed } = await import("@/services/attachments/storage-quota")
    const board = await svc.createBoard(projectId, { title: "images" }, actor)
    const before = await projectStorageUsed(prisma, projectId)
    const row = await repo.createBoardFile(prisma, { boardId: board.id, fileName: `${tag}-missing.png`, mimeType: "image/png", fileSize: 1234, createdById: actor.userId })
    expect(await projectStorageUsed(prisma, projectId)).toBe(before + 1234)
    expect(await repo.countBoardFiles(prisma, board.id)).toBe(1)
    expect(await svc.getBoardImage(projectId, board.id, row.id)).toEqual({ fileName: `${tag}-missing.png`, mimeType: "image/png" })
    await expect(prisma.boardFile.create({ data: { boardId: board.id, fileName: "x.png", mimeType: "image/png", fileSize: -1 } })).rejects.toThrow()
    await svc.deleteBoard(projectId, board.id, actor)
    await expect(svc.getBoardImage(projectId, board.id, row.id)).rejects.toMatchObject({ status: 404 })
    // The purge removes the row (the file is not on disk here: a missing file is ignored).
    await svc.purgeBoard(projectId, board.id)
    expect(await prisma.boardFile.count({ where: { boardId: board.id } })).toBe(0)
    expect(await projectStorageUsed(prisma, projectId)).toBe(before)
  })
  it("trash keeps the content, restore returns it, the purge removes board, sheets and elements", async () => {
    const board = await svc.createBoard(projectId, { title: "trash" }, actor)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-000001", version: 1, deleted: false, data: rect(1) }] }, actor)

    await expect(svc.purgeBoard(projectId, board.id)).rejects.toMatchObject({ status: 404 }) // live boards are never purged
    await svc.deleteBoard(projectId, board.id, actor)
    await expect(svc.getBoard(projectId, board.id)).rejects.toMatchObject({ status: 404 })
    await expect(svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-000002", version: 1, deleted: false, data: rect(2) }] }, actor)).rejects.toMatchObject({ status: 404 })
    const trashed = await svc.listBoards(projectId, { trashed: true })
    expect(trashed.boards.find((b) => b.id === board.id)).toMatchObject({ deletedBy: { id: actor.userId, name: actor.userId } })
    expect((await svc.listBoards(projectId)).boards.some((b) => b.id === board.id)).toBe(false)

    await svc.restoreBoard(projectId, board.id)
    expect((await svc.readElements(projectId, board.id, sheetId)).elements.map((e) => e.id)).toEqual(["el-000001"])

    await svc.deleteBoard(projectId, board.id, actor)
    const repo = await import("../boards.repository")
    const expired = await repo.findExpiredTrashedBoards(prisma, new Date(Date.now() + 60_000), 500)
    expect(expired).toContainEqual({ id: board.id, projectId })
    expect((await repo.findExpiredTrashedBoards(prisma, new Date(Date.now() - 3_600_000), 500)).some((b) => b.id === board.id)).toBe(false)
    await svc.purgeBoard(projectId, board.id)
    expect(await prisma.board.count({ where: { id: board.id } })).toBe(0)
    expect(await prisma.boardSheet.count({ where: { boardId: board.id } })).toBe(0)
    expect(await prisma.boardElement.count({ where: { sheetId } })).toBe(0)
  })

  it("the database refuses what the service never writes (unique element id, bounds, non-object data)", async () => {
    const board = await svc.createBoard(projectId, { title: "constraints" }, actor)
    const sheetId = board.sheets[0].id
    const row = { sheetId, elementId: "el-000001", version: 1, rev: 1, data: rect(1) }
    await prisma.boardElement.create({ data: row })
    await expect(prisma.boardElement.create({ data: row })).rejects.toBeTruthy()
    await expect(prisma.boardElement.create({ data: { ...row, elementId: "el-000002", version: 0 } })).rejects.toBeTruthy()
    await expect(prisma.boardElement.create({ data: { ...row, elementId: "el-000003", rev: 0 } })).rejects.toBeTruthy()
    await expect(prisma.boardElement.create({ data: { ...row, elementId: "el-000004", data: [1, 2] } })).rejects.toBeTruthy()
    await expect(prisma.boardElement.create({ data: { ...row, elementId: "el-000005", data: "text" } })).rejects.toBeTruthy()
    await expect(prisma.boardSheet.update({ where: { id: sheetId }, data: { rev: -1 } })).rejects.toBeTruthy()
    expect(await prisma.boardElement.count({ where: { sheetId } })).toBe(1)
  })

  it("boards go with their project (ON DELETE CASCADE)", async () => {
    const other = `${tag}-p2`
    await prisma.project.create({ data: { id: other, name: `${tag} 2` } })
    const board = await svc.createBoard(other, { title: "cascade" }, actor)
    await svc.writeElements(other, board.id, board.sheets[0].id, { elements: [{ id: "el-000001", version: 1, deleted: false, data: rect(1) }] }, actor)
    await prisma.project.delete({ where: { id: other } })
    expect(await prisma.board.count({ where: { projectId: other } })).toBe(0)
    expect(await prisma.boardElement.count({ where: { sheetId: board.sheets[0].id } })).toBe(0)
  })
})

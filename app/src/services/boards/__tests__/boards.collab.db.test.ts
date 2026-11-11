import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The White Board's working-together parts (B7) against a REAL PostgreSQL: presence, versions (automatic, named,
 * restore), comments with @mentions, and the backlog items boxes stand for. Skipped unless KANFLOW_DB_TESTS=1
 * (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/boards/__tests__/boards.collab.db.test.ts
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("White Board collaboration on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `boardcollab-${Date.now().toString(36)}`
  const projectId = `${tag}-p`
  const alice = { userId: `${tag}-a`, userName: "合成アリス", systemRole: "member" }
  const bob = { userId: `${tag}-b`, userName: "合成ボブ", systemRole: "member" }
  const rect = (x: number, extra: Record<string, unknown> = {}) => ({ type: "rect", x, y: 0, w: 100, h: 60, z: 1, text: "", fill: "white", stroke: "ink", ...extra })

  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("../boards.service")
  let collab: typeof import("../boards.collab")

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("../boards.service")
    collab = await import("../boards.collab")
    for (const u of [alice, bob]) await prisma.user.create({ data: { id: u.userId, name: u.userName, email: `${u.userId}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: projectId, name: tag } })
    await prisma.projectMember.createMany({ data: [alice, bob].map((u) => ({ projectId, userId: u.userId, role: "member" })) })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.notification.deleteMany({ where: { projectId } })
    await prisma.board.deleteMany({ where: { projectId } })
    await prisma.productBacklogItem.deleteMany({ where: { projectId } })
    await prisma.projectMember.deleteMany({ where: { projectId } })
    await prisma.project.deleteMany({ where: { id: projectId } })
    await prisma.user.deleteMany({ where: { id: { in: [alice.userId, bob.userId] } } })
  })

  it("presence: each sees the other (with the selection), not themself; leaving removes the row", async () => {
    const board = await svc.createBoard(projectId, { title: "presence" }, alice)
    const sheetId = board.sheets[0].id
    await collab.heartbeat(projectId, board.id, sheetId, { selection: ["el-abc-0001"] }, alice)
    const seen = await collab.heartbeat(projectId, board.id, sheetId, { selection: [] }, bob)
    expect(seen.viewers).toEqual([{ userId: alice.userId, name: "合成アリス", selection: ["el-abc-0001"] }])
    await collab.leave(projectId, board.id, sheetId, alice)
    expect((await collab.heartbeat(projectId, board.id, sheetId, { selection: [] }, bob)).viewers).toEqual([])
    // Another project's id never reaches the sheet.
    await expect(collab.heartbeat(`${tag}-other`, board.id, sheetId, { selection: [] }, bob)).rejects.toThrow()
  })

  it("versions: the first write keeps one automatically; a named one can be saved; restore puts the sheet back and keeps the state before", async () => {
    const board = await svc.createBoard(projectId, { title: "history" }, alice)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-keep-0001", version: 1, deleted: false, data: rect(0, { text: "最初（合成）" }) }] }, alice)
    let list = await collab.listVersions(projectId, board.id, sheetId)
    expect(list.versions).toHaveLength(1)
    expect(list.versions[0]).toMatchObject({ auto: true, elementCount: 1, createdBy: "合成アリス" })
    // Within 10 minutes no second automatic version.
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-more-0001", version: 1, deleted: false, data: rect(200) }] }, bob)
    expect((await collab.listVersions(projectId, board.id, sheetId)).versions).toHaveLength(1)
    const named = await collab.saveVersion(projectId, board.id, sheetId, { label: "レビュー前（合成）" }, bob)
    expect(named).toMatchObject({ label: "レビュー前（合成）", auto: false, elementCount: 2, createdBy: "合成ボブ" })

    // Change the sheet: edit one, delete the other, add a third.
    await svc.writeElements(
      projectId,
      board.id,
      sheetId,
      {
        elements: [
          { id: "el-keep-0001", version: 2, deleted: false, data: rect(0, { text: "変えた（合成）" }) },
          { id: "el-more-0001", version: 2, deleted: true },
          { id: "el-new-00001", version: 1, deleted: false, data: rect(400) },
        ],
      },
      alice,
    )
    const firstAuto = list.versions[0]
    const result = await collab.restoreVersion(projectId, board.id, sheetId, firstAuto.id, bob)
    expect(result).toMatchObject({ restored: 1, removed: 1 })
    const now = await svc.readElements(projectId, board.id, sheetId)
    expect(now.elements.map((e) => e.id)).toEqual(["el-keep-0001"])
    expect((now.elements[0].data as { text: string }).text).toBe("最初（合成）")
    // One above what was stored: every open editor takes it.
    expect(now.elements[0].version).toBe(3)
    // The state before the restore was kept (it can be undone).
    list = await collab.listVersions(projectId, board.id, sheetId)
    expect(list.versions[0]).toMatchObject({ auto: true, elementCount: 2 })
    const before = await collab.getVersion(projectId, board.id, sheetId, list.versions[0].id)
    expect(before.elements.map((e) => e.id).sort()).toEqual(["el-keep-0001", "el-new-00001"])
  })

  it("named versions are limited per sheet (automatic ones are counted apart)", async () => {
    const board = await svc.createBoard(projectId, { title: "named" }, alice)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-n-000001", version: 1, deleted: false, data: rect(0) }] }, alice)
    const { BOARD_LIMITS } = await import("@/lib/board/limits")
    for (let i = 0; i < BOARD_LIMITS.namedVersionsPerSheet; i++) await collab.saveVersion(projectId, board.id, sheetId, { label: `v${i}（合成）` }, alice)
    await expect(collab.saveVersion(projectId, board.id, sheetId, { label: "one too many" }, alice)).rejects.toMatchObject({ code: "BOARD_VERSION_LIMIT" })
    const list = await collab.listVersions(projectId, board.id, sheetId)
    expect(list.versions.filter((v) => v.auto)).toHaveLength(1)
    expect(list.versions.filter((v) => !v.auto)).toHaveLength(BOARD_LIMITS.namedVersionsPerSheet)
  })

  it("comments: an @mention notifies the member (a link to the board), not the author; resolve and delete follow the rules", async () => {
    const board = await svc.createBoard(projectId, { title: "コメント（合成）" }, alice)
    const sheetId = board.sheets[0].id
    const comment = await collab.createComment(projectId, board.id, { sheetId, elementId: "el-abc-0001", body: "@[合成ボブ] 確認お願いします" }, alice)
    expect(comment).toMatchObject({ sheetId, elementId: "el-abc-0001", author: { id: alice.userId, name: "合成アリス" }, resolved: false })
    const notes = await prisma.notification.findMany({ where: { projectId, entityType: "board", entityId: board.id } })
    expect(notes.map((n) => [n.recipientId, n.type])).toEqual([[bob.userId, "mentioned"]])
    expect(JSON.parse(notes[0].payload ?? "{}")).toMatchObject({ entityLabel: "コメント（合成）", sheetId, elementId: "el-abc-0001" })
    expect(JSON.parse(notes[0].payload ?? "{}").body).toBeUndefined()

    expect((await collab.resolveComment(projectId, board.id, comment.id, true, bob)).resolved).toBe(true)
    await expect(collab.deleteComment(projectId, board.id, comment.id, bob, false)).rejects.toThrow()
    await collab.deleteComment(projectId, board.id, comment.id, bob, true)
    expect((await collab.listComments(projectId, board.id)).comments).toEqual([])
    // A sheet of another board is refused.
    const other = await svc.createBoard(projectId, { title: "other" }, alice)
    await expect(collab.createComment(projectId, board.id, { sheetId: other.sheets[0].id, elementId: null, body: "x" }, alice)).rejects.toThrow()
  })

  it("PBI drafts read the shape's surroundings from the stored sheet: arrows, frame and open comments", async () => {
    const board = await svc.createBoard(projectId, { title: "下書き（合成）" }, alice)
    const sheetId = board.sheets[0].id
    const frame = { type: "frame", x: 0, y: 0, w: 600, h: 400, z: 0, text: "Try（合成）", fill: "none", stroke: "gray" }
    await svc.writeElements(
      projectId,
      board.id,
      sheetId,
      {
        elements: [
          { id: "el-frame-001", version: 1, deleted: false, data: frame },
          { id: "el-cause-001", version: 1, deleted: false, data: rect(700, { text: "手待ちが多い（合成）" }) },
          { id: "el-idea-0001", version: 1, deleted: false, data: rect(20, { y: 40, text: "部品を手元化（合成）" }) },
          { id: "el-arrow-001", version: 1, deleted: false, data: { type: "arrow", z: 2, stroke: "ink", start: { x: 700, y: 30, attach: "el-cause-001" }, end: { x: 120, y: 70, attach: "el-idea-0001" }, label: "原因" } },
        ],
      },
      alice,
    )
    await collab.createComment(projectId, board.id, { sheetId, elementId: "el-idea-0001", body: "効果を測る（合成）" }, alice)
    const lines = ((await collab.shapeDraftSource(projectId, board.id, sheetId, "el-idea-0001")) ?? []).join("\n")
    expect(lines).toContain("部品を手元化（合成）")
    expect(lines).toContain("見出し: Try（合成）")
    expect(lines).toContain("- 手待ちが多い（合成）（矢印の文字: 原因）")
    expect(lines).toContain("- 効果を測る（合成）")
    await expect(collab.shapeDraftSource(projectId, board.id, sheetId, "el-missing-1")).rejects.toThrow()
    await expect(collab.shapeDraftSource(`${tag}-other`, board.id, sheetId, "el-idea-0001")).rejects.toThrow()
  })

  it("PBIs: a box's item is read live; the item's detail finds the boards that stand for it", async () => {
    const item = await prisma.productBacklogItem.create({ data: { projectId, displayId: 7, userStory: "合成ストーリー\n2 行目", status: "ready" } })
    const board = await svc.createBoard(projectId, { title: "PBI 連携（合成）" }, alice)
    const sheetId = board.sheets[0].id
    await svc.writeElements(projectId, board.id, sheetId, { elements: [{ id: "el-pbi-00001", version: 1, deleted: false, data: rect(0, { pbiId: item.id }) }] }, alice)
    expect((await collab.pbiSummaries(projectId, board.id, [item.id, "missing-id"])).items).toEqual([{ id: item.id, displayId: 7, title: "合成ストーリー", status: "ready", assignee: null, confidential: false }])
    expect((await collab.searchPbis(projectId, "#7")).items.map((i) => i.id)).toEqual([item.id])
    expect((await collab.searchPbis(projectId, "ストーリー")).items.map((i) => i.id)).toEqual([item.id])
    expect((await collab.boardsOfPbi(projectId, item.id)).links).toEqual([{ boardId: board.id, boardTitle: "PBI 連携（合成）", sheetId, sheetName: board.sheets[0].name, elementId: "el-pbi-00001" }])
    // A trashed board is not listed.
    await svc.deleteBoard(projectId, board.id, alice)
    expect((await collab.boardsOfPbi(projectId, item.id)).links).toEqual([])
  })
})

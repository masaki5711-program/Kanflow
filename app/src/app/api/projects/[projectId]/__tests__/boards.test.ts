import { beforeEach, describe, expect, it, vi } from "vitest"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { fakeBoardsRepository, fakeBoardsState, resetFakeBoards } from "@/services/boards/__tests__/fake-boards-repository"
import { asRole, authMock, ctx, PROJECT_ID, read, sectionFindFirst, signedOut } from "./route-harness"

/**
 * ボード routes end to end on an in-memory repository: the real gate (requireProject), the real request
 * schemas and the real service (merge rule, revisions, limits). Synthetic data only.
 */
vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/_shared/db", async () => (await import("@/services/boards/__tests__/fake-boards-repository")).fakeDbModule)
vi.mock("@/services/boards/boards.repository", async () => (await import("@/services/boards/__tests__/fake-boards-repository")).fakeBoardsRepository)

const boards = await import("../boards/route")
const board = await import("../boards/[boardId]/route")
const restore = await import("../boards/[boardId]/restore/route")
const sheets = await import("../boards/[boardId]/sheets/route")
const sheetOrder = await import("../boards/[boardId]/sheets/order/route")
const sheet = await import("../boards/[boardId]/sheets/[sheetId]/route")
const duplicate = await import("../boards/[boardId]/sheets/[sheetId]/duplicate/route")
const elements = await import("../boards/[boardId]/sheets/[sheetId]/elements/route")

const BASE = `http://localhost/api/projects/${PROJECT_ID}/boards`

function request(method: string, body?: unknown, query = ""): Request {
  if (body === undefined) return new Request(`${BASE}${query}`, { method })
  return new Request(`${BASE}${query}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/** A section manager of the project's section: may view, is not a member. */
function asSectionManager(): void {
  asRole(null, "section_manager")
  sectionFindFirst.mockResolvedValue({ sectionId: "sec-1" })
}

function asOutsider(): void {
  asRole(null)
}

interface BoardBody {
  id: string
  title: string
  sheets: Array<{ id: string; name: string; rev: number }>
}

async function newBoard(title = "構想メモ"): Promise<BoardBody> {
  asRole("dev")
  const res = await read(await boards.POST(request("POST", { title }), ctx()))
  expect(res.status).toBe(201)
  return res.body as BoardBody
}

const rect = (x: number, extra: Record<string, unknown> = {}) => ({ type: "rect", x, y: 0, w: 100, h: 60, z: 1, text: "", fill: "white", stroke: "ink", ...extra })

async function write(boardId: string, sheetId: string, list: unknown[]) {
  return read(await elements.POST(request("POST", { elements: list }), ctx({ boardId, sheetId })))
}

async function readSheet(boardId: string, sheetId: string, query = "") {
  return read(await elements.GET(request("GET", undefined, query), ctx({ boardId, sheetId })))
}

beforeEach(() => {
  resetFakeBoards()
  authMock.mockReset()
})

describe("who may do what", () => {
  it("no session → 401, not a member → 404, on every board route", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })
    const s = ctx({ boardId: created.id, sheetId: created.sheets[0].id })
    const calls: Array<() => Promise<Response>> = [
      () => boards.GET(request("GET"), ctx()),
      () => boards.POST(request("POST", { title: "x" }), ctx()),
      () => board.GET(request("GET"), b),
      () => board.PATCH(request("PATCH", { title: "x" }), b),
      () => board.DELETE(request("DELETE"), b),
      () => restore.POST(request("POST"), b),
      () => sheets.POST(request("POST", { name: "x" }), b),
      () => sheetOrder.PUT(request("PUT", { sheetIds: [created.sheets[0].id] }), b),
      () => sheet.PATCH(request("PATCH", { name: "x" }), s),
      () => sheet.DELETE(request("DELETE"), s),
      () => duplicate.POST(request("POST", { name: "x" }), s),
      () => elements.GET(request("GET"), s),
      () => elements.POST(request("POST", { elements: [{ id: "el-000001", version: 1, data: rect(1) }] }), s),
    ]
    for (const call of calls) {
      signedOut()
      expect((await call()).status).toBe(401)
      asOutsider()
      expect((await call()).status).toBe(404)
    }
    expect(fakeBoardsState.boards.get(created.id)).toMatchObject({ title: "構想メモ", deletedAt: null })
    expect(fakeBoardsState.elements.get(created.sheets[0].id)?.size ?? 0).toBe(0)
  })

  it("a viewer who is not a member (section manager) reads, and is refused every write with 403", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })
    const s = ctx({ boardId: created.id, sheetId: created.sheets[0].id })
    asSectionManager()

    const list = await read(await boards.GET(request("GET"), ctx()))
    expect(list.status).toBe(200)
    expect(list.body).toMatchObject({ boards: [{ id: created.id, title: "構想メモ", sheetCount: 1 }], permissions: { canWrite: false, canManage: false } })
    expect((await board.GET(request("GET"), b)).status).toBe(200)
    expect((await elements.GET(request("GET"), s)).status).toBe(200)

    const refused: Array<() => Promise<Response>> = [
      () => boards.POST(request("POST", { title: "x" }), ctx()),
      () => boards.GET(request("GET", undefined, "?trashed=1"), ctx()),
      () => board.PATCH(request("PATCH", { title: "x" }), b),
      () => board.DELETE(request("DELETE"), b),
      () => restore.POST(request("POST"), b),
      () => sheets.POST(request("POST", { name: "x" }), b),
      () => sheetOrder.PUT(request("PUT", { sheetIds: [created.sheets[0].id] }), b),
      () => sheet.PATCH(request("PATCH", { name: "x" }), s),
      () => sheet.DELETE(request("DELETE"), s),
      () => duplicate.POST(request("POST", { name: "x" }), s),
      () => elements.POST(request("POST", { elements: [{ id: "el-000001", version: 1, data: rect(1) }] }), s),
    ]
    for (const call of refused) {
      const res = await read(await call())
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: "FORBIDDEN" })
    }
    expect(fakeBoardsState.boards.size).toBe(1)
    expect(fakeBoardsState.sheets.size).toBe(1)
  })

  it("a member draws but only the PO / SM deletes and restores a board", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })

    asRole("dev")
    expect(await read(await board.GET(request("GET"), b))).toMatchObject({ status: 200, body: { permissions: { canWrite: true, canManage: false } } })
    expect((await board.DELETE(request("DELETE"), b)).status).toBe(403)
    expect((await boards.GET(request("GET", undefined, "?trashed=1"), ctx())).status).toBe(403)
    expect((await restore.POST(request("POST"), b)).status).toBe(403)

    asRole("sm")
    expect(await read(await board.GET(request("GET"), b))).toMatchObject({ body: { permissions: { canWrite: true, canManage: true } } })
    expect((await board.DELETE(request("DELETE"), b)).status).toBe(200)
  })

  it("an admin who is not a member may do everything", async () => {
    asRole(null, "admin")
    const created = (await read(await boards.POST(request("POST", { title: "admin" }), ctx()))).body as BoardBody
    expect((await board.DELETE(request("DELETE"), ctx({ boardId: created.id }))).status).toBe(200)
    expect((await restore.POST(request("POST"), ctx({ boardId: created.id }))).status).toBe(200)
  })
})

describe("boards", () => {
  it("creates a board with its first sheet and lists the latest change first", async () => {
    const first = await newBoard("一つ目")
    expect(first).toMatchObject({ title: "一つ目", sheets: [{ name: "Sheet 1", rev: 0 }] })
    const second = (await read(await boards.POST(request("POST", { title: "  二つ目  ", sheetName: "シート 1" }), ctx()))).body as BoardBody
    expect(second).toMatchObject({ title: "二つ目", sheets: [{ name: "シート 1" }] })

    const list = (await read(await boards.GET(request("GET"), ctx()))).body as { boards: Array<{ id: string }>; limit: number }
    expect(list.boards.map((x) => x.id)).toEqual([second.id, first.id])
    expect(list.limit).toBe(BOARD_LIMITS.boardsPerProject)

    // Drawing on the first board moves it to the top.
    await write(first.id, first.sheets[0].id, [{ id: "el-000001", version: 1, data: rect(1) }])
    const after = (await read(await boards.GET(request("GET"), ctx()))).body as { boards: Array<{ id: string }> }
    expect(after.boards.map((x) => x.id)).toEqual([first.id, second.id])
  })

  it("refuses a bad title or body with 400", async () => {
    asRole("dev")
    for (const body of [{}, { title: "" }, { title: "   " }, { title: "x".repeat(BOARD_LIMITS.titleLength + 1) }, { title: "ok", sheetName: "" }]) {
      const res = await read(await boards.POST(request("POST", body), ctx()))
      expect(res).toMatchObject({ status: 400, body: { code: "VALIDATION" } })
    }
    expect(await read(await boards.POST(request("POST", "{not json"), ctx()))).toMatchObject({ status: 400, body: { code: "INVALID_JSON" } })
    expect(fakeBoardsState.boards.size).toBe(0)
  })

  it("stops at the number of boards a project may hold", async () => {
    asRole("dev")
    for (let i = 0; i < BOARD_LIMITS.boardsPerProject; i++) {
      await fakeBoardsRepository.createBoard({}, { projectId: PROJECT_ID, title: `b${i}`, createdById: "u1", sheetName: "Sheet 1" })
    }
    const res = await read(await boards.POST(request("POST", { title: "one more" }), ctx()))
    expect(res).toMatchObject({ status: 409, body: { code: "BOARD_LIMIT_REACHED", limit: BOARD_LIMITS.boardsPerProject } })
  })

  it("renames; a board of another project is not found", async () => {
    const created = await newBoard()
    const renamed = await read(await board.PATCH(request("PATCH", { title: "新しい名前" }), ctx({ boardId: created.id })))
    expect(renamed).toMatchObject({ status: 200, body: { id: created.id, title: "新しい名前", sheets: [{ id: created.sheets[0].id }] } })

    const other = await fakeBoardsRepository.createBoard({}, { projectId: "another-project", title: "theirs", createdById: "u9", sheetName: "Sheet 1" })
    const o = ctx({ boardId: other.id })
    expect((await board.GET(request("GET"), o)).status).toBe(404)
    expect((await board.PATCH(request("PATCH", { title: "mine now" }), o)).status).toBe(404)
    expect((await elements.GET(request("GET"), ctx({ boardId: other.id, sheetId: other.sheets[0].id }))).status).toBe(404)
    expect((await write(other.id, other.sheets[0].id, [{ id: "el-000001", version: 1, data: rect(1) }])).status).toBe(404)
    asRole("po")
    expect((await board.DELETE(request("DELETE"), o)).status).toBe(404)
    expect(fakeBoardsState.boards.get(other.id)).toMatchObject({ title: "theirs", deletedAt: null })
  })

  it("delete moves the board to the trash with its content; restore brings it back", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })
    const s = ctx({ boardId: created.id, sheetId: created.sheets[0].id })
    await write(created.id, created.sheets[0].id, [{ id: "el-000001", version: 1, data: rect(1) }])
    fakeBoardsState.users.set("u1", "Alice")

    asRole("po")
    expect((await restore.POST(request("POST"), b)).status).toBe(404) // not in the trash
    expect((await board.DELETE(request("DELETE"), b)).status).toBe(200)

    // Gone for every read and write, but kept.
    expect((await board.GET(request("GET"), b)).status).toBe(404)
    expect((await board.PATCH(request("PATCH", { title: "x" }), b)).status).toBe(404)
    expect((await board.DELETE(request("DELETE"), b)).status).toBe(404)
    expect((await elements.GET(request("GET"), s)).status).toBe(404)
    expect((await write(created.id, created.sheets[0].id, [{ id: "el-000002", version: 1, data: rect(2) }])).status).toBe(404)
    expect((await sheets.POST(request("POST", { name: "x" }), b)).status).toBe(404)
    asRole("po")
    expect(((await read(await boards.GET(request("GET"), ctx()))).body as { boards: unknown[] }).boards).toEqual([])

    const trash = await read(await boards.GET(request("GET", undefined, "?trashed=1"), ctx()))
    expect(trash.body).toMatchObject({ boards: [{ id: created.id, deletedBy: { id: "u1", name: "Alice" } }] })
    expect((trash.body as { boards: Array<{ deletedAt: string | null }> }).boards[0].deletedAt).not.toBeNull()

    expect((await restore.POST(request("POST"), b)).status).toBe(200)
    const back = await readSheet(created.id, created.sheets[0].id)
    expect(back).toMatchObject({ status: 200, body: { rev: 1, elements: [{ id: "el-000001", version: 1 }] } })
  })
})

describe("sheets", () => {
  it("adds at the end, renames, and keeps the order", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })
    const added = await read(await sheets.POST(request("POST", { name: "案B" }), b))
    expect(added.status).toBe(201)
    const body = added.body as { board: BoardBody; sheetId: string }
    expect(body.board.sheets.map((x) => x.name)).toEqual(["Sheet 1", "案B"])
    expect(body.board.sheets[1].id).toBe(body.sheetId)

    const renamed = await read(await sheet.PATCH(request("PATCH", { name: "案B（改）" }), ctx({ boardId: created.id, sheetId: body.sheetId })))
    expect((renamed.body as BoardBody).sheets.map((x) => x.name)).toEqual(["Sheet 1", "案B（改）"])

    expect(await read(await sheet.PATCH(request("PATCH", { name: "" }), ctx({ boardId: created.id, sheetId: body.sheetId })))).toMatchObject({ status: 400 })
    expect((await sheet.PATCH(request("PATCH", { name: "x" }), ctx({ boardId: created.id, sheetId: "no-such-sheet" }))).status).toBe(404)
    expect(await read(await sheets.POST(request("POST", { name: "x".repeat(BOARD_LIMITS.sheetNameLength + 1) }), b))).toMatchObject({ status: 400 })
  })

  it("stops at the number of sheets a board may hold (add and duplicate)", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })
    for (let i = 1; i < BOARD_LIMITS.sheetsPerBoard; i++) {
      expect((await sheets.POST(request("POST", { name: `s${i}` }), b)).status).toBe(201)
    }
    expect(await read(await sheets.POST(request("POST", { name: "over" }), b))).toMatchObject({ status: 409, body: { code: "BOARD_SHEET_LIMIT_REACHED" } })
    const dup = await duplicate.POST(request("POST", { name: "copy" }), ctx({ boardId: created.id, sheetId: created.sheets[0].id }))
    expect(await read(dup)).toMatchObject({ status: 409, body: { code: "BOARD_SHEET_LIMIT_REACHED" } })
    expect(fakeBoardsState.sheets.size).toBe(BOARD_LIMITS.sheetsPerBoard)
  })

  it("never deletes the last sheet; deleting another one removes its elements", async () => {
    const created = await newBoard()
    const first = created.sheets[0].id
    const b = ctx({ boardId: created.id })
    expect(await read(await sheet.DELETE(request("DELETE"), ctx({ boardId: created.id, sheetId: first })))).toMatchObject({ status: 409, body: { code: "BOARD_LAST_SHEET" } })

    const second = ((await read(await sheets.POST(request("POST", { name: "2" }), b))).body as { sheetId: string }).sheetId
    const third = ((await read(await sheets.POST(request("POST", { name: "3" }), b))).body as { sheetId: string }).sheetId
    await write(created.id, second, [{ id: "el-000001", version: 1, data: rect(1) }])

    const res = await read(await sheet.DELETE(request("DELETE"), ctx({ boardId: created.id, sheetId: second })))
    expect(res.status).toBe(200)
    expect((res.body as BoardBody).sheets.map((x) => x.id)).toEqual([first, third])
    expect(fakeBoardsState.elements.has(second)).toBe(false)
    expect((await elements.GET(request("GET"), ctx({ boardId: created.id, sheetId: second }))).status).toBe(404)
    expect([...fakeBoardsState.sheets.values()].map((x) => x.sortOrder).sort()).toEqual([0, 1])
  })

  it("duplicates a sheet right after it, with its live elements only", async () => {
    const created = await newBoard()
    const first = created.sheets[0].id
    const b = ctx({ boardId: created.id })
    const last = ((await read(await sheets.POST(request("POST", { name: "最後" }), b))).body as { sheetId: string }).sheetId
    await write(created.id, first, [
      { id: "box-000001", version: 1, data: rect(1) },
      { id: "box-000002", version: 1, data: rect(2) },
      { id: "arrow-0001", version: 4, data: { type: "arrow", z: 2, stroke: "ink", start: { x: 0, y: 0, attach: "box-000001" }, end: { x: 9, y: 9 } } },
    ])
    await write(created.id, first, [{ id: "box-000002", version: 2, deleted: true }])

    const res = await read(await duplicate.POST(request("POST", { name: "Sheet 1 のコピー" }), ctx({ boardId: created.id, sheetId: first })))
    expect(res.status).toBe(201)
    const body = res.body as { board: BoardBody; sheetId: string }
    expect(body.board.sheets.map((x) => x.id)).toEqual([first, body.sheetId, last])
    expect(body.board.sheets[1]).toMatchObject({ name: "Sheet 1 のコピー", rev: 1 })

    const copy = (await readSheet(created.id, body.sheetId)).body as { rev: number; elements: Array<{ id: string; version: number; data: unknown }> }
    expect(copy.rev).toBe(1)
    expect(copy.elements.map((e) => [e.id, e.version]).sort()).toEqual([
      ["arrow-0001", 1],
      ["box-000001", 1],
    ])
    expect(copy.elements.find((e) => e.id === "arrow-0001")?.data).toMatchObject({ start: { attach: "box-000001" } })

    // The copy is independent of the original.
    await write(created.id, body.sheetId, [{ id: "box-000001", version: 2, data: rect(500) }])
    const original = (await readSheet(created.id, first)).body as { elements: Array<{ id: string; data: { x: number } }> }
    expect(original.elements.find((e) => e.id === "box-000001")?.data.x).toBe(1)
  })

  it("reorders by a full list of the board's sheets, and refuses anything else", async () => {
    const created = await newBoard()
    const b = ctx({ boardId: created.id })
    const a = created.sheets[0].id
    const c = ((await read(await sheets.POST(request("POST", { name: "2" }), b))).body as { sheetId: string }).sheetId
    const d = ((await read(await sheets.POST(request("POST", { name: "3" }), b))).body as { sheetId: string }).sheetId

    const res = await read(await sheetOrder.PUT(request("PUT", { sheetIds: [d, a, c] }), b))
    expect(res.status).toBe(200)
    expect((res.body as BoardBody).sheets.map((x) => x.id)).toEqual([d, a, c])

    for (const sheetIds of [[d, a], [d, a, a], [d, a, "stranger"], [d, a, c, "extra"], []]) {
      expect(await read(await sheetOrder.PUT(request("PUT", { sheetIds }), b))).toMatchObject({ status: 400, body: { code: "VALIDATION" } })
    }
    expect(((await read(await board.GET(request("GET"), b))).body as BoardBody).sheets.map((x) => x.id)).toEqual([d, a, c])
  })
})

describe("elements: write only what changed, the higher version stays", () => {
  it("stores new elements and gives the sheet its next revision", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    const first = await write(created.id, sheetId, [
      { id: "el-000001", version: 1, data: rect(10) },
      { id: "el-000002", version: 1, data: rect(20) },
    ])
    expect(first).toEqual({ status: 200, body: { rev: 1, applied: 2, stale: [] } })

    const second = await write(created.id, sheetId, [{ id: "el-000002", version: 2, data: rect(25) }])
    expect(second.body).toEqual({ rev: 2, applied: 1, stale: [] })

    const all = await readSheet(created.id, sheetId)
    expect(all.body).toMatchObject({ rev: 2, full: true })
    const got = (all.body as { elements: Array<{ id: string; version: number; deleted: boolean; data: { x: number } }> }).elements
    expect(got.map((e) => [e.id, e.version, e.deleted, e.data.x]).sort()).toEqual([
      ["el-000001", 1, false, 10],
      ["el-000002", 2, false, 25],
    ])
    expect(fakeBoardsState.elements.get(sheetId)?.get("el-000002")).toMatchObject({ rev: 2, updatedById: "u1" })
  })

  it("keeps its own row against a lower or equal version and hands it back as stale", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    await write(created.id, sheetId, [{ id: "el-000001", version: 1, data: rect(10) }])
    await write(created.id, sheetId, [{ id: "el-000001", version: 3, data: rect(30) }])

    const lower = await write(created.id, sheetId, [{ id: "el-000001", version: 2, data: rect(99) }])
    expect(lower.body).toEqual({ rev: 2, applied: 0, stale: [{ id: "el-000001", version: 3, deleted: false, data: rect(30) }] })
    const equal = await write(created.id, sheetId, [{ id: "el-000001", version: 3, data: rect(99) }])
    expect(equal.body).toMatchObject({ rev: 2, applied: 0, stale: [{ id: "el-000001", version: 3 }] })

    // One request can be partly applied: the fresh element is stored, the stale one is reported.
    const mixed = await write(created.id, sheetId, [
      { id: "el-000001", version: 3, data: rect(99) },
      { id: "el-000002", version: 1, data: rect(5) },
    ])
    expect(mixed.body).toMatchObject({ rev: 3, applied: 1, stale: [{ id: "el-000001", data: rect(30) }] })

    // The writer re-sends above the server's version: the later save wins.
    const again = await write(created.id, sheetId, [{ id: "el-000001", version: 4, data: rect(99) }])
    expect(again.body).toEqual({ rev: 4, applied: 1, stale: [] })
  })

  it("a repeated request changes nothing (same versions, same content)", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    const body = [
      { id: "el-000001", version: 1, data: rect(10) },
      { id: "el-000002", version: 1, deleted: true },
    ]
    // The delete of an element never stored is kept as a tombstone too (its create may still be on its way).
    expect((await write(created.id, sheetId, body)).body).toEqual({ rev: 1, applied: 2, stale: [] })
    expect((await write(created.id, sheetId, body)).body).toEqual({ rev: 1, applied: 0, stale: [] })
    expect((await readSheet(created.id, sheetId)).body).toMatchObject({ rev: 1 })
  })

  it("a delete stays as a marker without content; a full read leaves it out", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    await write(created.id, sheetId, [{ id: "el-000001", version: 1, data: rect(10, { text: "secret" }) }])
    expect((await write(created.id, sheetId, [{ id: "el-000001", version: 2, deleted: true }])).body).toEqual({ rev: 2, applied: 1, stale: [] })

    expect((await readSheet(created.id, sheetId)).body).toEqual({ rev: 2, full: true, elements: [] })
    expect(fakeBoardsState.elements.get(sheetId)?.get("el-000001")).toMatchObject({ deleted: true, version: 2, data: {} })

    // An older edit of the deleted element does not bring it back; a newer one does.
    expect((await write(created.id, sheetId, [{ id: "el-000001", version: 2, data: rect(11) }])).body).toMatchObject({
      applied: 0,
      stale: [{ id: "el-000001", version: 2, deleted: true, data: {} }],
    })
    expect((await write(created.id, sheetId, [{ id: "el-000001", version: 3, data: rect(11) }])).body).toMatchObject({ rev: 3, applied: 1 })
  })

  it("since=<rev> returns only what was written after it, deletions included", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    await write(created.id, sheetId, [
      { id: "el-000001", version: 1, data: rect(1) },
      { id: "el-000002", version: 1, data: rect(2) },
      { id: "el-000003", version: 1, data: rect(3) },
    ])
    await write(created.id, sheetId, [{ id: "el-000002", version: 2, data: rect(22) }])
    await write(created.id, sheetId, [{ id: "el-000003", version: 2, deleted: true }])

    const delta = await readSheet(created.id, sheetId, "?since=1")
    expect(delta.body).toEqual({
      rev: 3,
      full: false,
      elements: [
        { id: "el-000002", version: 2, deleted: false, data: rect(22) },
        { id: "el-000003", version: 2, deleted: true, data: {} },
      ],
    })
    expect((await readSheet(created.id, sheetId, "?since=3")).body).toEqual({ rev: 3, full: false, elements: [] })
    expect(((await readSheet(created.id, sheetId, "?since=0")).body as { elements: unknown[] }).elements).toHaveLength(3)

    for (const bad of ["?since=abc", "?since=-1", "?since=1.5", "?since=", "?since=99999999999"]) {
      expect(await readSheet(created.id, sheetId, bad)).toMatchObject({ status: 400, body: { code: "VALIDATION" } })
    }
  })

  it("stores an element of a type it does not know untouched, and extra keys of a known type", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    const image = { type: "image", fileId: "file-1", x: 5, y: 6, w: 320, h: 200, crop: { top: 0.1 }, future: [1, "two", null] }
    const richRect = rect(1, { fontSize: 18, link: { href: "/projects/p/backlog" } })
    expect((await write(created.id, sheetId, [
      { id: "img-000001", version: 1, data: image },
      { id: "box-000001", version: 1, data: richRect },
    ])).body).toMatchObject({ applied: 2 })

    const got = ((await readSheet(created.id, sheetId)).body as { elements: Array<{ id: string; data: unknown }> }).elements
    expect(got.find((e) => e.id === "img-000001")?.data).toEqual(image)
    expect(got.find((e) => e.id === "box-000001")?.data).toEqual(richRect)
  })
})

describe("elements: what the server refuses", () => {
  it("400 for a malformed write", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    const ok = { id: "el-000001", version: 1, data: rect(1) }
    const bad: unknown[] = [
      {},
      { elements: [] },
      { elements: "nope" },
      { elements: [{ ...ok, id: "x" }] },
      { elements: [{ ...ok, id: "has space 1" }] },
      { elements: [{ ...ok, version: 0 }] },
      { elements: [{ ...ok, version: 1.5 }] },
      { elements: [{ ...ok, version: BOARD_LIMITS.counter + 1 }] },
      { elements: [{ id: "el-000001", version: 1 }] },
      { elements: [{ id: "el-000001", version: 1, deleted: false }] },
      { elements: [{ ...ok, data: [] }] },
      { elements: [{ ...ok, data: {} }] },
      { elements: [{ ...ok, data: { type: "Not A Type" } }] },
      { elements: [{ ...ok, data: { type: "rect" } }] },
      { elements: [{ ...ok, data: rect(1, { w: 0 }) }] },
      { elements: [{ ...ok, data: rect(BOARD_LIMITS.coordinate + 1) }] },
      { elements: [{ ...ok, data: rect(1, { fill: "#ff0000" }) }] },
      { elements: [{ ...ok, data: rect(1, { text: "x".repeat(BOARD_LIMITS.textLength + 1) }) }] },
      { elements: [{ ...ok, data: { type: "arrow", z: 1, stroke: "ink", start: { x: 0, y: 0 } } }] },
      { elements: [{ ...ok, data: { type: "blob", payload: "x".repeat(BOARD_LIMITS.elementJsonChars) } }] },
      { elements: [ok, { ...ok, version: 2 }] },
      { elements: Array.from({ length: BOARD_LIMITS.elementsPerWrite + 1 }, (_, i) => ({ id: `el-${String(i).padStart(6, "0")}`, version: 1, deleted: true })) },
    ]
    for (const body of bad) {
      const res = await read(await elements.POST(request("POST", body), ctx({ boardId: created.id, sheetId })))
      expect(res, JSON.stringify(body).slice(0, 120)).toMatchObject({ status: 400, body: { code: "VALIDATION" } })
    }
    expect(await read(await elements.POST(request("POST", "{oops"), ctx({ boardId: created.id, sheetId })))).toMatchObject({ status: 400, body: { code: "INVALID_JSON" } })
    expect((await readSheet(created.id, sheetId)).body).toEqual({ rev: 0, full: true, elements: [] })
  })

  it("413 for a body over the limit, declared or not", async () => {
    const created = await newBoard()
    const s = ctx({ boardId: created.id, sheetId: created.sheets[0].id })
    const huge = JSON.stringify({ elements: [], pad: "x".repeat(BOARD_LIMITS.writeBodyBytes) })

    const declared = new Request(BASE, { method: "POST", headers: { "content-length": String(BOARD_LIMITS.writeBodyBytes + 1) }, body: "{}" })
    expect(await read(await elements.POST(declared, s))).toMatchObject({ status: 413, body: { code: "BOARD_WRITE_TOO_LARGE" } })

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(huge))
        controller.close()
      },
    })
    const undeclared = new Request(BASE, { method: "POST", body: stream, duplex: "half" } as RequestInit)
    expect(await read(await elements.POST(undeclared, s))).toMatchObject({ status: 413, body: { code: "BOARD_WRITE_TOO_LARGE" } })
  })

  it("the largest write the editor sends is accepted", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    const list = Array.from({ length: BOARD_LIMITS.elementsPerWrite }, (_, i) => ({ id: `el-${String(i).padStart(6, "0")}`, version: 1, data: rect(i) }))
    expect((await write(created.id, sheetId, list)).body).toMatchObject({ rev: 1, applied: BOARD_LIMITS.elementsPerWrite })
  })

  it("409 when the write would overfill the sheet; changing and deleting still work", async () => {
    const created = await newBoard()
    const sheetId = created.sheets[0].id
    await fakeBoardsRepository.insertElements(
      {},
      sheetId,
      Array.from({ length: BOARD_LIMITS.elementsPerSheet }, (_, i) => ({ elementId: `seed-${String(i).padStart(6, "0")}`, version: 1, deleted: false, data: rect(i), rev: 1, updatedById: null }))
    )
    await fakeBoardsRepository.setSheetRev({}, sheetId, 1)

    const over = await write(created.id, sheetId, [
      { id: "seed-000000", version: 2, data: rect(7) },
      { id: "el-new-0001", version: 1, data: rect(1) },
    ])
    expect(over).toMatchObject({ status: 409, body: { code: "BOARD_SHEET_FULL", limit: BOARD_LIMITS.elementsPerSheet } })
    // Nothing of the refused request was stored.
    expect(fakeBoardsState.elements.get(sheetId)?.get("seed-000000")).toMatchObject({ version: 1 })

    expect((await write(created.id, sheetId, [{ id: "seed-000000", version: 2, data: rect(7) }])).body).toMatchObject({ applied: 1 })
    // Deleting one makes room for one.
    expect((await write(created.id, sheetId, [
      { id: "seed-000001", version: 2, deleted: true },
      { id: "el-new-0001", version: 1, data: rect(1) },
    ])).body).toMatchObject({ applied: 2 })
  })

  it("404 for a sheet that is not of this board", async () => {
    const one = await newBoard("one")
    const two = await newBoard("two")
    expect((await readSheet(one.id, two.sheets[0].id)).status).toBe(404)
    expect((await write(one.id, two.sheets[0].id, [{ id: "el-000001", version: 1, data: rect(1) }])).status).toBe(404)
    expect((await sheet.DELETE(request("DELETE"), ctx({ boardId: one.id, sheetId: two.sheets[0].id }))).status).toBe(404)
    expect(fakeBoardsState.elements.get(two.sheets[0].id)?.size ?? 0).toBe(0)
  })
})

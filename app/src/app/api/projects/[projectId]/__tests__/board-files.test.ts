import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { fakeBoardsState, resetFakeBoards } from "@/services/boards/__tests__/fake-boards-repository"
import { asRole, authMock, ctx, PROJECT_ID, read, sectionFindFirst, signedOut } from "./route-harness"

/**
 * Images on a board (B2): upload checked by content, served only for a live board of the project, counted, and
 * removed from disk when the board is purged. In-memory repository, files in a temporary folder. Synthetic data.
 */
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), "kanflow-board-files-"))
const quota = vi.hoisted(() => ({ assertStorageQuota: vi.fn(async () => undefined) }))

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/_shared/db", async () => (await import("@/services/boards/__tests__/fake-boards-repository")).fakeDbModule)
vi.mock("@/services/boards/boards.repository", async () => (await import("@/services/boards/__tests__/fake-boards-repository")).fakeBoardsRepository)
vi.mock("@/services/attachments/storage-quota", () => quota)
vi.mock("@/lib/upload/stored-files", async () => {
  const p = await import("path")
  const f = await import("fs/promises")
  const root = () => p.join(TMP, "uploads")
  const safeFilePath = (projectId: string, fileName: string) => {
    const resolved = p.resolve(root(), projectId, fileName)
    return resolved.startsWith(root() + p.sep) ? resolved : null
  }
  return {
    uploadsRoot: root,
    safeFilePath,
    deleteUploadedFile: async (projectId: string, fileName: string) => {
      const full = safeFilePath(projectId, fileName)
      if (full) await f.rm(full, { force: true })
    },
  }
})

const boards = await import("../boards/route")
const board = await import("../boards/[boardId]/route")
const files = await import("../boards/[boardId]/files/route")
const file = await import("../boards/[boardId]/files/[fileId]/route")
const { purgeBoard } = await import("@/services/boards/boards.service")

// A 1 × 1 PNG (synthetic).
const PNG: Uint8Array<ArrayBuffer> = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))

function upload(boardId: string, bytes: Uint8Array<ArrayBuffer>, name: string, type: string): Promise<Response> {
  return encoded(bytes, name, type).then((body) => files.POST(new Request(URL_OF(boardId), { method: "POST", headers: body.headers, body: body.bytes }), ctx({ boardId })))
}

const URL_OF = (boardId: string) => `http://localhost/api/projects/${PROJECT_ID}/boards/${boardId}/files`

/** The multipart body as a browser sends it: bytes with their Content-Type and Content-Length. */
async function encoded(bytes: Uint8Array<ArrayBuffer>, name: string, type: string): Promise<{ bytes: ArrayBuffer; headers: Record<string, string> }> {
  const form = new FormData()
  form.append("file", new File([bytes], name, { type }))
  const req = new Request("http://localhost/x", { method: "POST", body: form })
  const body = await req.arrayBuffer()
  return { bytes: body, headers: { "content-type": req.headers.get("content-type") ?? "", "content-length": String(body.byteLength) } }
}

async function newBoard(): Promise<string> {
  asRole("dev")
  const res = await read(await boards.POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "画像テスト" }) }), ctx()))
  return (res.body as { id: string }).id
}

beforeEach(() => {
  resetFakeBoards()
  authMock.mockReset()
  quota.assertStorageQuota.mockClear()
})

afterAll(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

describe("board images", () => {
  it("refuses an upload without a declared length (the form would be buffered whole)", async () => {
    const boardId = await newBoard()
    const body = await encoded(PNG, "image.png", "image/png")
    const res = await files.POST(new Request(URL_OF(boardId), { method: "POST", headers: { "content-type": body.headers["content-type"] }, body: body.bytes }), ctx({ boardId }))
    expect(res.status).toBe(411)
    expect(fakeBoardsState.files.size).toBe(0)
  })

  it("stores a PNG, serves it with its checked type, and removes it when the board is purged", async () => {
    const boardId = await newBoard()
    const res = await read(await upload(boardId, PNG, "image.png", "image/png"))
    expect(res.status).toBe(201)
    const dto = res.body as { id: string; mimeType: string; fileSize: number }
    expect(dto).toMatchObject({ mimeType: "image/png", fileSize: PNG.byteLength })
    expect(quota.assertStorageQuota).toHaveBeenCalledWith(PROJECT_ID, PNG.byteLength)

    const got = await file.GET(new Request("http://localhost/x"), ctx({ boardId, fileId: dto.id }))
    expect(got.status).toBe(200)
    expect(got.headers.get("content-type")).toBe("image/png")
    expect(got.headers.get("x-content-type-options")).toBe("nosniff")
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG)

    const stored = [...fakeBoardsState.files.values()][0]
    const onDisk = path.join(TMP, "uploads", PROJECT_ID, stored.fileName)
    await expect(fs.stat(onDisk)).resolves.toBeTruthy()
    // To the trash: the image is no longer served. Purged: the file is gone.
    asRole("po")
    expect((await board.DELETE(new Request("http://localhost/x", { method: "DELETE" }), ctx({ boardId }))).status).toBe(200)
    expect((await file.GET(new Request("http://localhost/x"), ctx({ boardId, fileId: dto.id }))).status).toBe(404)
    await purgeBoard(PROJECT_ID, boardId)
    await expect(fs.stat(onDisk)).rejects.toThrow()
  })

  it("refuses what is not a raster image, by content", async () => {
    const boardId = await newBoard()
    const svg = new Uint8Array(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))
    expect((await read(await upload(boardId, svg, "a.svg", "image/svg+xml"))).body).toMatchObject({ code: "BOARD_IMAGE_TYPE" })
    const fake = new Uint8Array(new TextEncoder().encode("not a png at all"))
    const res = await read(await upload(boardId, fake, "a.png", "image/png"))
    expect(res.status).toBe(415)
    expect(res.body).toMatchObject({ code: "BOARD_IMAGE_TYPE" })
    // A pasted image without a usable name takes its extension from the declared type.
    expect((await read(await upload(boardId, PNG, "blob", "image/png"))).status).toBe(201)
    expect(fakeBoardsState.files.size).toBe(1)
  })

  it("refuses an image over the size limit and a board that holds as many images as it may", async () => {
    const boardId = await newBoard()
    const big = new Uint8Array(BOARD_LIMITS.imageBytes + 1)
    big.set(PNG)
    expect((await upload(boardId, big, "big.png", "image/png")).status).toBe(413)
    for (let i = 0; i < BOARD_LIMITS.imagesPerBoard; i++) {
      fakeBoardsState.files.set(`f${i}`, { id: `f${i}`, boardId, fileName: `x${i}.png`, mimeType: "image/png", fileSize: 1 })
    }
    expect((await read(await upload(boardId, PNG, "image.png", "image/png"))).body).toMatchObject({ code: "BOARD_IMAGE_LIMIT" })
  })

  it("who may upload and read: members upload, a non-member viewer reads only, outsiders get 404", async () => {
    const boardId = await newBoard()
    const dto = (await read(await upload(boardId, PNG, "image.png", "image/png"))).body as { id: string }
    asRole(null, "section_manager")
    sectionFindFirst.mockResolvedValue({ sectionId: "sec-1" })
    expect((await upload(boardId, PNG, "image.png", "image/png")).status).toBe(403)
    expect((await file.GET(new Request("http://localhost/x"), ctx({ boardId, fileId: dto.id }))).status).toBe(200)
    asRole(null)
    expect((await file.GET(new Request("http://localhost/x"), ctx({ boardId, fileId: dto.id }))).status).toBe(404)
    signedOut()
    expect((await upload(boardId, PNG, "image.png", "image/png")).status).toBe(401)
    // Another board's id does not reach this image.
    asRole("dev")
    const other = await newBoard()
    expect((await file.GET(new Request("http://localhost/x"), ctx({ boardId: other, fileId: dto.id }))).status).toBe(404)
  })
})

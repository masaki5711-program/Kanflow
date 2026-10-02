import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ctx, PROJECT_ID, asRole, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/team-chat/team-chat.service", () => ({ getAttachment: vi.fn() }))

const svc = await import("@/services/team-chat/team-chat.service")
const route = await import("@/app/api/projects/[projectId]/talk/attachments/[attachmentId]/route")
const { NotFoundError } = await import("@/services/_shared")

const aCtx = () => ctx({ attachmentId: "ta1" })

let tmpRoot: string
beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kanflow-talk-att-"))
})
afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(svc.getAttachment).mockReset()
  vi.spyOn(process, "cwd").mockReturnValue(tmpRoot)
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function storeFile(fileName: string, content: string) {
  const dir = path.join(tmpRoot, "private", "uploads", PROJECT_ID)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileName), content)
}

describe("GET /talk/attachments/[attachmentId]", () => {
  it("serves the stored file inline", async () => {
    asRole("dev")
    await storeFile("stored.txt", "file contents")
    vi.mocked(svc.getAttachment).mockResolvedValue({ fileName: "stored.txt", originalName: "notes.txt", mimeType: "text/plain" })
    const res = await route.GET(req("GET"), aCtx())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("file contents")
    expect(svc.getAttachment).toHaveBeenCalledWith(PROJECT_ID, "ta1")
  })

  it("forces a download with ?download=1", async () => {
    asRole("dev")
    await storeFile("stored.txt", "x")
    vi.mocked(svc.getAttachment).mockResolvedValue({ fileName: "stored.txt", originalName: "notes.txt", mimeType: "text/plain" })
    const res = await route.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/talk/attachments/ta1?download=1`), aCtx())
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
  })

  it("404 when the attachment does not exist (deleted message or wrong project)", async () => {
    asRole("dev")
    vi.mocked(svc.getAttachment).mockRejectedValue(new NotFoundError())
    const res = await route.GET(req("GET"), aCtx())
    expect(res.status).toBe(404)
  })

  it("404 when the stored file is missing on disk", async () => {
    asRole("dev")
    vi.mocked(svc.getAttachment).mockResolvedValue({ fileName: "gone.txt", originalName: "gone.txt", mimeType: "text/plain" })
    const res = await route.GET(req("GET"), aCtx())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "File missing", code: "FILE_MISSING" })
  })

  it("401 without a session, 404 for a non-member — service never called", async () => {
    const { signedOut } = await import("./route-harness")
    signedOut()
    expect((await route.GET(req("GET"), aCtx())).status).toBe(401)
    asRole(null)
    expect((await route.GET(req("GET"), aCtx())).status).toBe(404)
    expect(svc.getAttachment).not.toHaveBeenCalled()
  })
})

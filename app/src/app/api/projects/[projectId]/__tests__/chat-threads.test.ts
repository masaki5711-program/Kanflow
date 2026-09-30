import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/chat-threads/chat-threads.service", () => ({
  listThreads: vi.fn(),
  getThread: vi.fn(),
  renameThread: vi.fn(),
  deleteThread: vi.fn(),
}))

const svc = await import("@/services/chat-threads/chat-threads.service")
const list = await import("@/app/api/projects/[projectId]/chat/threads/route")
const one = await import("@/app/api/projects/[projectId]/chat/threads/[threadId]/route")
const { NotFoundError } = await import("@/services/_shared")

const OWNER = { projectId: PROJECT_ID, userId: "u1" }
const get = (q = "") => new Request(`http://localhost/api/projects/${PROJECT_ID}/chat/threads${q}`)
const tCtx = () => ctx({ threadId: "t1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
  vi.mocked(svc.listThreads).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(svc.getThread).mockResolvedValue({ thread: { id: "t1" }, messages: [] } as never)
  vi.mocked(svc.renameThread).mockResolvedValue({ id: "t1", title: "New" } as never)
  vi.mocked(svc.deleteThread).mockResolvedValue(undefined)
})

describe("GET /chat/threads", () => {
  it("lists the caller's own threads with defaults", async () => {
    asRole("dev")
    expect(await read(await list.GET(get(), ctx()))).toEqual({ status: 200, body: { items: [], nextCursor: null } })
    expect(svc.listThreads).toHaveBeenCalledWith(OWNER, { limit: 30 })
    await list.GET(get("?limit=5&cursor=abc"), ctx())
    expect(svc.listThreads).toHaveBeenLastCalledWith(OWNER, { limit: 5, cursor: "abc" })
  })

  it("scopes an admin to their own threads too", async () => {
    asRole(null, "admin")
    await list.GET(get(), ctx())
    expect(svc.listThreads).toHaveBeenCalledWith(OWNER, { limit: 30 })
  })

  it("401 / 404 / 400", async () => {
    signedOut()
    expect((await list.GET(get(), ctx())).status).toBe(401)
    asRole(null)
    expect((await list.GET(get(), ctx())).status).toBe(404)
    asRole("dev")
    expect((await list.GET(get("?limit=0"), ctx())).status).toBe(400)
    expect(svc.listThreads).not.toHaveBeenCalled()
  })
})

describe("/chat/threads/[threadId]", () => {
  it("GET returns the owner's thread", async () => {
    asRole("dev")
    expect(await read(await one.GET(req("GET"), tCtx()))).toEqual({ status: 200, body: { thread: { id: "t1" }, messages: [] } })
    expect(svc.getThread).toHaveBeenCalledWith(OWNER, "t1")
  })

  it("404 when the service does not find it among the caller's threads", async () => {
    asRole("po")
    vi.mocked(svc.getThread).mockRejectedValue(new NotFoundError("Chat thread not found"))
    expect((await one.GET(req("GET"), tCtx())).status).toBe(404)
    vi.mocked(svc.deleteThread).mockRejectedValue(new NotFoundError("Chat thread not found"))
    expect((await one.DELETE(req("DELETE"), tCtx())).status).toBe(404)
  })

  it("PATCH renames with a trimmed title; 400 for an empty one", async () => {
    asRole("dev")
    expect(await read(await one.PATCH(req("PATCH", { title: "  New  " }), tCtx()))).toEqual({
      status: 200,
      body: { id: "t1", title: "New" },
    })
    expect(svc.renameThread).toHaveBeenCalledWith(OWNER, "t1", "New")
    expect((await one.PATCH(req("PATCH", { title: "   " }), tCtx())).status).toBe(400)
    expect((await one.PATCH(req("PATCH", { title: "x".repeat(201) }), tCtx())).status).toBe(400)
  })

  it("DELETE soft-deletes", async () => {
    asRole("dev")
    expect(await read(await one.DELETE(req("DELETE"), tCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteThread).toHaveBeenCalledWith(OWNER, "t1")
  })

  it("section managers without membership cannot use the chat", async () => {
    asRole(null, "section_manager")
    const { sectionFindFirst } = await import("./route-harness")
    sectionFindFirst.mockResolvedValue({ sectionId: "s" })
    expect((await one.GET(req("GET"), tCtx())).status).toBe(403)
  })
})

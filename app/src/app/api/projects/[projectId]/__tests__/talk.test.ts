import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/team-chat/team-chat.service", () => ({
  listMessages: vi.fn(),
  createMessage: vi.fn(),
  deleteMessage: vi.fn(),
  getChatSummary: vi.fn(),
  markChatRead: vi.fn(),
}))

const svc = await import("@/services/team-chat/team-chat.service")
const messages = await import("@/app/api/projects/[projectId]/talk/messages/route")
const messageId = await import("@/app/api/projects/[projectId]/talk/messages/[messageId]/route")
const readRoute = await import("@/app/api/projects/[projectId]/talk/read/route")
const { ValidationError, ForbiddenError } = await import("@/services/_shared")

const mCtx = () => ctx({ messageId: "msg-1" })

function multipartReq(fields: Record<string, string>, files: { field: string; file: File }[] = []): Request {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  for (const { field, file } of files) fd.append(field, file)
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/talk/messages`, { method: "POST", body: fd })
}

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET /talk/messages", () => {
  it("lists oldest-first for the viewer, with canModerate derived from the role", async () => {
    asRole("po")
    vi.mocked(svc.listMessages).mockResolvedValue({ items: [], hasMore: false })
    const res = await messages.GET(req("GET"), ctx())
    expect(res.status).toBe(200)
    expect(svc.listMessages).toHaveBeenCalledWith(PROJECT_ID, { userId: ACTOR.userId, canModerate: true }, { before: undefined, after: undefined, forMe: false })
  })

  it("a dev (non-PO) cannot moderate", async () => {
    asRole("dev")
    vi.mocked(svc.listMessages).mockResolvedValue({ items: [], hasMore: false })
    await messages.GET(req("GET"), ctx())
    expect(svc.listMessages).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ canModerate: false }), expect.anything())
  })

  it("parses ?before / ?after / ?forMe=1 from the query string", async () => {
    asRole("dev")
    vi.mocked(svc.listMessages).mockResolvedValue({ items: [], hasMore: false })
    const url = `http://localhost/api/projects/${PROJECT_ID}/talk/messages?before=2026-01-01T00:00:00.000Z&forMe=1`
    await messages.GET(new Request(url), ctx())
    expect(svc.listMessages).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.anything(),
      { before: new Date("2026-01-01T00:00:00.000Z"), after: undefined, forMe: true }
    )
  })

  it("400 for an unparseable time", async () => {
    asRole("dev")
    const url = `http://localhost/api/projects/${PROJECT_ID}/talk/messages?before=not-a-date`
    const res = await messages.GET(new Request(url), ctx())
    expect(res.status).toBe(400)
    expect(svc.listMessages).not.toHaveBeenCalled()
  })

  it("401 without a session", async () => {
    const { signedOut } = await import("./route-harness")
    signedOut()
    expect((await messages.GET(req("GET"), ctx())).status).toBe(401)
  })

  it("404 for a non-member", async () => {
    asRole(null)
    expect((await messages.GET(req("GET"), ctx())).status).toBe(404)
    expect(svc.listMessages).not.toHaveBeenCalled()
  })
})

describe("POST /talk/messages", () => {
  it("creates a message with body, replyToId and files from multipart", async () => {
    asRole("po")
    vi.mocked(svc.createMessage).mockResolvedValue({ id: "m1" } as never)
    const file = new File(["x"], "a.txt")
    const res = await messages.POST(multipartReq({ body: "hello", replyToId: "r1" }, [{ field: "files", file }]), ctx())
    expect(res.status).toBe(201)
    expect(svc.createMessage).toHaveBeenCalledWith(
      PROJECT_ID,
      { body: "hello", replyToId: "r1", files: [expect.objectContaining({ name: "a.txt" })] },
      ACTOR,
      true,
    )
  })

  it("defaults body to '' and replyToId to null when absent, files to []", async () => {
    asRole("dev")
    vi.mocked(svc.createMessage).mockResolvedValue({ id: "m1" } as never)
    await messages.POST(multipartReq({}), ctx())
    expect(svc.createMessage).toHaveBeenCalledWith(PROJECT_ID, { body: "", replyToId: null, files: [] }, ACTOR, false)
  })

  it("truncates an overlong replyToId to 191 characters", async () => {
    asRole("dev")
    vi.mocked(svc.createMessage).mockResolvedValue({ id: "m1" } as never)
    const long = "r".repeat(250)
    await messages.POST(multipartReq({ replyToId: long }), ctx())
    expect(svc.createMessage).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ replyToId: long.slice(0, 191) }), ACTOR, false)
  })

  it("ignores a non-string replyToId field", async () => {
    asRole("dev")
    vi.mocked(svc.createMessage).mockResolvedValue({ id: "m1" } as never)
    const fd = new FormData()
    fd.append("replyToId", new File(["x"], "weird"))
    await messages.POST(new Request(`http://localhost/api/projects/${PROJECT_ID}/talk/messages`, { method: "POST", body: fd }), ctx())
    expect(svc.createMessage).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ replyToId: null }), ACTOR, false)
  })

  it("surfaces a validation error from the service as 400", async () => {
    asRole("dev")
    vi.mocked(svc.createMessage).mockRejectedValue(new ValidationError("empty", {}, "TEAM_CHAT_EMPTY"))
    const res = await messages.POST(multipartReq({}), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("TEAM_CHAT_EMPTY")
  })

  it("401 without a session, 404 for a non-member — service never called", async () => {
    const { signedOut } = await import("./route-harness")
    signedOut()
    expect((await messages.POST(multipartReq({ body: "x" }), ctx())).status).toBe(401)
    asRole(null)
    expect((await messages.POST(multipartReq({ body: "x" }), ctx())).status).toBe(404)
    expect(svc.createMessage).not.toHaveBeenCalled()
  })
})

describe("DELETE /talk/messages/[messageId]", () => {
  it("deletes with the actor and canModerate derived from role", async () => {
    asRole("po")
    vi.mocked(svc.deleteMessage).mockResolvedValue(undefined as never)
    const res = await messageId.DELETE(req("DELETE"), mCtx())
    expect(res.status).toBe(200)
    expect(svc.deleteMessage).toHaveBeenCalledWith(PROJECT_ID, "msg-1", ACTOR, true)
  })

  it("surfaces a forbidden error from the service as 403", async () => {
    asRole("dev")
    vi.mocked(svc.deleteMessage).mockRejectedValue(new ForbiddenError("nope"))
    expect((await messageId.DELETE(req("DELETE"), mCtx())).status).toBe(403)
  })

  it("401 / 404 gates before the service is called", async () => {
    const { signedOut } = await import("./route-harness")
    signedOut()
    expect((await messageId.DELETE(req("DELETE"), mCtx())).status).toBe(401)
    asRole(null)
    expect((await messageId.DELETE(req("DELETE"), mCtx())).status).toBe(404)
    expect(svc.deleteMessage).not.toHaveBeenCalled()
  })
})

describe("GET/POST /talk/read", () => {
  it("GET returns the viewer's chat summary", async () => {
    asRole("dev")
    vi.mocked(svc.getChatSummary).mockResolvedValue({ unread: 2, forYou: 1, lastReadAt: null })
    const res = await readRoute.GET(req("GET"), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unread: 2, forYou: 1, lastReadAt: null })
    expect(svc.getChatSummary).toHaveBeenCalledWith(ACTOR.userId, PROJECT_ID)
  })

  it("POST marks the chat read for the viewer", async () => {
    asRole("dev")
    vi.mocked(svc.markChatRead).mockResolvedValue({ lastReadAt: "2026-01-01T00:00:00.000Z" })
    const res = await readRoute.POST(req("POST"), ctx())
    expect(res.status).toBe(200)
    expect(svc.markChatRead).toHaveBeenCalledWith(ACTOR.userId, PROJECT_ID)
  })

  it("401 without a session; 404 for a non-member", async () => {
    const { signedOut } = await import("./route-harness")
    signedOut()
    expect((await readRoute.GET(req("GET"), ctx())).status).toBe(401)
    asRole(null)
    expect((await readRoute.POST(req("POST"), ctx())).status).toBe(404)
    expect(svc.markChatRead).not.toHaveBeenCalled()
  })
})

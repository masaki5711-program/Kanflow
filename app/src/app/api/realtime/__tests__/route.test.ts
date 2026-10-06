import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const projectFindFirst = vi.fn()
const memberFindFirst = vi.fn()
const sectionFindFirst = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }

vi.mock("@/lib/auth", () => ({ auth: () => auth() }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: (...a: unknown[]) => projectFindFirst(...a) },
    projectMember: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
    projectSection: { findFirst: (...a: unknown[]) => sectionFindFirst(...a) },
  },
}))

const { GET } = await import("../route")
const bus = await import("@/lib/realtime/bus")
const sse = await import("@/lib/realtime/sse")

const session = (id = "u1", role = "member") => ({ user: { id, role } })

async function open(query = "") {
  const controller = new AbortController()
  const res = await GET(new Request(`http://localhost/api/realtime${query}`, { signal: controller.signal }))
  return { res, controller }
}

/** The `ready` frame's projectId (the first two chunks are retry + ready). */
async function readyProject(res: Response): Promise<string | null> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ""
  while (!text.includes("event: ready")) text += decoder.decode((await reader.read()).value)
  const data = /event: ready\ndata: (.*)\n/.exec(text)?.[1] ?? "{}"
  reader.releaseLock()
  return (JSON.parse(data) as { projectId: string | null }).projectId
}

beforeEach(() => {
  vi.clearAllMocks()
  bus.resetBusForTests()
  sse.resetConnectionsForTests()
  projectFindFirst.mockResolvedValue({ id: "p1" })
  memberFindFirst.mockResolvedValue({ role: "dev" })
  sectionFindFirst.mockResolvedValue(null)
})

describe("GET /api/realtime", () => {
  it("401 without a session (nothing subscribed)", async () => {
    auth.mockResolvedValue(null)
    const { res } = await open("?projectId=p1")
    expect(res.status).toBe(401)
    expect(bus.listenerCount()).toBe(0)
  })

  it("streams text/event-stream without caching / transformation for a signed-in user", async () => {
    auth.mockResolvedValue(session())
    const { res, controller } = await open()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform")
    expect(await readyProject(res)).toBeNull()
    controller.abort()
  })

  it("a member subscribes to the project's events", async () => {
    auth.mockResolvedValue(session())
    const { res, controller } = await open("?projectId=p1")
    expect(await readyProject(res)).toBe("p1")
    controller.abort()
    expect(bus.listenerCount()).toBe(0)
  })

  it("a non-member gets the stream (own events) but NOT the project's events", async () => {
    auth.mockResolvedValue(session())
    memberFindFirst.mockResolvedValue(null)
    const { res, controller } = await open("?projectId=p1")
    expect(res.status).toBe(200)
    expect(await readyProject(res)).toBeNull()
    controller.abort()
  })

  it("a trashed / missing project is not subscribed, admins included", async () => {
    auth.mockResolvedValue(session("a1", "admin"))
    projectFindFirst.mockResolvedValue(null)
    const { res, controller } = await open("?projectId=p1")
    expect(await readyProject(res)).toBeNull()
    controller.abort()
  })

  it("a malformed project id is ignored without a lookup", async () => {
    auth.mockResolvedValue(session())
    const { res, controller } = await open(`?projectId=${encodeURIComponent("p1' OR 1=1")}`)
    expect(await readyProject(res)).toBeNull()
    expect(projectFindFirst).not.toHaveBeenCalled()
    controller.abort()
  })

  it("a failing project check degrades to no project events", async () => {
    auth.mockResolvedValue(session())
    memberFindFirst.mockRejectedValue(new Error("db down"))
    const { res, controller } = await open("?projectId=p1")
    expect(await readyProject(res)).toBeNull()
    expect(noopLog.warn).toHaveBeenCalled()
    controller.abort()
  })

  it("429 once the user has MAX_CONNECTIONS_PER_USER streams open", async () => {
    auth.mockResolvedValue(session())
    const opened = []
    for (let i = 0; i < sse.MAX_CONNECTIONS_PER_USER; i++) opened.push(await open())
    const { res } = await open()
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" })
    for (const o of opened) o.controller.abort()
    expect(sse.openConnectionCount("u1")).toBe(0)
  })
})

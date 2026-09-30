/**
 * Security regression net for every project-scoped route handler.
 *
 * The REAL gate (`requireProject` → `auth()` + `prisma.projectMember` /
 * `prisma.projectSection` lookups) runs; only its leaf dependencies are faked.
 * Every service / AI / file module a route imports is replaced by an inert
 * recording fake so we can prove that a refused request never reaches it.
 *
 *   no session         → 401
 *   non-member         → 404 (project existence is not leaked)
 *   unrelated sec. mgr → 404
 *
 * A filesystem sweep asserts the table lists every `route.ts` under
 * `projects/[projectId]`, so a new route cannot silently skip this test.
 */
import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => {
  const AUTHZ_LOOKUPS = new Set(["projectMember.findFirst", "projectSection.findFirst"])
  const auth = vi.fn()
  /** Every fake function created for mocked modules, keyed "module:export". */
  const spies = new Map<string, ReturnType<typeof vi.fn>>()

  function spyFor(key: string) {
    let fn = spies.get(key)
    if (!fn) {
      fn = vi.fn(async () => {
        throw new Error(`unexpected call to ${key}`)
      })
      spies.set(key, fn)
    }
    return fn
  }

  /** Module namespace whose every export is a recording spy. */
  function inertModule(name: string, real: Record<string, unknown> = {}) {
    return new Proxy(real, {
      get(target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "__esModule") return undefined
        if (prop in target) return target[prop]
        return spyFor(`${name}:${prop}`)
      },
      has: () => true,
    })
  }

  /** prisma.<model>.<method> → recording spy; authz lookups are driven by the test. */
  const prisma = new Proxy(
    {},
    {
      get(_t, model) {
        if (typeof model !== "string" || model === "then") return undefined
        if (model.startsWith("$")) return spyFor(`prisma:${model}`)
        return new Proxy(
          {},
          {
            get(_t2, method) {
              if (typeof method !== "string" || method === "then") return undefined
              return spyFor(`prisma:${model}.${method}`)
            },
          }
        )
      },
    }
  )

  const noopLog = { debug() {}, info() {}, warn() {}, error() {}, child: () => noopLog }

  return { AUTHZ_LOOKUPS, auth, spies, spyFor, inertModule, prisma, noopLog }
})

vi.mock("@/lib/auth", () => ({ auth: () => h.auth() }))
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/lib/logger", () => ({ logger: h.noopLog }))

// Services
vi.mock("@/services/projects/projects.service", () => h.inertModule("projects.service"))
vi.mock("@/services/backlog/backlog.service", () => h.inertModule("backlog.service"))
vi.mock("@/services/sprints/sprints.service", () => h.inertModule("sprints.service"))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => h.inertModule("sprint-backlog.service"))
vi.mock("@/services/releases/releases.service", () => h.inertModule("releases.service"))
vi.mock("@/services/plan/plan.service", () => h.inertModule("plan.service"))
vi.mock("@/services/attachments/attachments.service", () => h.inertModule("attachments.service"))
vi.mock("@/services/icebox/icebox.service", () => h.inertModule("icebox.service"))
vi.mock("@/services/members/members.service", () => h.inertModule("members.service"))
vi.mock("@/services/goals/goals.service", () => h.inertModule("goals.service"))
vi.mock("@/services/events/events.service", () => h.inertModule("events.service"))
vi.mock("@/services/daily-scrums/daily-scrums.service", () => h.inertModule("daily-scrums.service"))
vi.mock("@/services/ai-reports/ai-reports.service", () => h.inertModule("ai-reports.service"))

// AI / file / network modules
vi.mock("@/lib/ollama", () => h.inertModule("ollama"))
vi.mock("@/lib/ollama/prime", () => h.inertModule("ollama/prime"))
vi.mock("@/lib/ai-analysis", () => h.inertModule("ai-analysis"))
vi.mock("@/lib/ai-monitor", () => h.inertModule("ai-monitor"))
vi.mock("@/lib/project-context", () => h.inertModule("project-context", { CHAT_SYSTEM_PROMPT: "" }))
vi.mock("@/lib/chat-tools", () => h.inertModule("chat-tools", { CHAT_TOOLS: [] }))
vi.mock("@/lib/analysis-tools", () => h.inertModule("analysis-tools", { analysisHandlers: {} }))
vi.mock("@/lib/attachment-extractor", () => h.inertModule("attachment-extractor"))
vi.mock("@/lib/collabora", () => h.inertModule("collabora"))
vi.mock("@/lib/wopi-token", () => h.inertModule("wopi-token"))

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
type RouteModule = Record<string, unknown>

interface RouteCase {
  /** Path relative to `src/app/api/projects/[projectId]` (for the fs sweep). */
  file: string
  load: () => Promise<RouteModule>
  params: Record<string, string>
}

const P = "proj-1"
const ROUTES: RouteCase[] = [
  { file: "route.ts", load: () => import("@/app/api/projects/[projectId]/route"), params: {} },
  { file: "ai-reports/route.ts", load: () => import("@/app/api/projects/[projectId]/ai-reports/route"), params: {} },
  { file: "ai/generate-pbi-field/route.ts", load: () => import("@/app/api/projects/[projectId]/ai/generate-pbi-field/route"), params: {} },
  { file: "ai/progress-report/route.ts", load: () => import("@/app/api/projects/[projectId]/ai/progress-report/route"), params: {} },
  { file: "attachments/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/route"), params: {} },
  { file: "attachments/[attachmentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/[attachmentId]/route"), params: { attachmentId: "att-1" } },
  { file: "attachments/[attachmentId]/editor-config/route.ts", load: () => import("@/app/api/projects/[projectId]/attachments/[attachmentId]/editor-config/route"), params: { attachmentId: "att-1" } },
  { file: "backlog/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/route"), params: {} },
  { file: "backlog/reorder/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/reorder/route"), params: {} },
  { file: "backlog/[itemId]/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/[itemId]/route"), params: { itemId: "pbi-1" } },
  { file: "backlog/[itemId]/ai/invest-review/route.ts", load: () => import("@/app/api/projects/[projectId]/backlog/[itemId]/ai/invest-review/route"), params: { itemId: "pbi-1" } },
  { file: "burndown/route.ts", load: () => import("@/app/api/projects/[projectId]/burndown/route"), params: {} },
  { file: "chat/route.ts", load: () => import("@/app/api/projects/[projectId]/chat/route"), params: {} },
  { file: "events/route.ts", load: () => import("@/app/api/projects/[projectId]/events/route"), params: {} },
  { file: "events/[eventId]/route.ts", load: () => import("@/app/api/projects/[projectId]/events/[eventId]/route"), params: { eventId: "ev-1" } },
  { file: "favorite/route.ts", load: () => import("@/app/api/projects/[projectId]/favorite/route"), params: {} },
  { file: "folders/route.ts", load: () => import("@/app/api/projects/[projectId]/folders/route"), params: {} },
  { file: "folders/[folderId]/route.ts", load: () => import("@/app/api/projects/[projectId]/folders/[folderId]/route"), params: { folderId: "f-1" } },
  { file: "goals/route.ts", load: () => import("@/app/api/projects/[projectId]/goals/route"), params: {} },
  { file: "goals/[goalId]/route.ts", load: () => import("@/app/api/projects/[projectId]/goals/[goalId]/route"), params: { goalId: "g-1" } },
  { file: "icebox/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/route"), params: {} },
  { file: "icebox/[itemId]/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/route"), params: { itemId: "ice-1" } },
  { file: "icebox/[itemId]/ai/generate-pbi-draft/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/ai/generate-pbi-draft/route"), params: { itemId: "ice-1" } },
  { file: "icebox/[itemId]/attachments/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/attachments/route"), params: { itemId: "ice-1" } },
  { file: "icebox/[itemId]/attachments/[attachmentId]/route.ts", load: () => import("@/app/api/projects/[projectId]/icebox/[itemId]/attachments/[attachmentId]/route"), params: { itemId: "ice-1", attachmentId: "att-1" } },
  { file: "members/route.ts", load: () => import("@/app/api/projects/[projectId]/members/route"), params: {} },
  { file: "members/[memberId]/route.ts", load: () => import("@/app/api/projects/[projectId]/members/[memberId]/route"), params: { memberId: "m-1" } },
  { file: "plan/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/route"), params: {} },
  { file: "plan/reorder/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/reorder/route"), params: {} },
  { file: "plan/[itemId]/route.ts", load: () => import("@/app/api/projects/[projectId]/plan/[itemId]/route"), params: { itemId: "plan-1" } },
  { file: "releases/route.ts", load: () => import("@/app/api/projects/[projectId]/releases/route"), params: {} },
  { file: "releases/import/route.ts", load: () => import("@/app/api/projects/[projectId]/releases/import/route"), params: {} },
  { file: "releases/[id]/route.ts", load: () => import("@/app/api/projects/[projectId]/releases/[id]/route"), params: { id: "rel-1" } },
  { file: "sprints/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/route"), params: {} },
  { file: "sprints/[sprintId]/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/ai/retro-synthesis/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/ai/retro-synthesis/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/daily-scrums/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/daily-scrums/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/daily-scrums/[noteId]/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/daily-scrums/[noteId]/route"), params: { sprintId: "s-1", noteId: "n-1" } },
  { file: "sprints/[sprintId]/pbis/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/pbis/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/tasks/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/tasks/route"), params: { sprintId: "s-1" } },
  { file: "sprints/[sprintId]/tasks/[taskId]/route.ts", load: () => import("@/app/api/projects/[projectId]/sprints/[sprintId]/tasks/[taskId]/route"), params: { sprintId: "s-1", taskId: "t-1" } },
]

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

interface HandlerCase {
  name: string
  method: string
  handler: Handler
  params: Record<string, string>
}

async function collectHandlers(): Promise<HandlerCase[]> {
  const out: HandlerCase[] = []
  for (const route of ROUTES) {
    const mod = await route.load()
    for (const method of METHODS) {
      const handler = mod[method]
      if (typeof handler === "function") {
        out.push({ name: `${method} ${route.file}`, method, handler: handler as Handler, params: route.params })
      }
    }
  }
  return out
}

const HANDLERS = await collectHandlers()

function buildRequest(method: string): Request {
  const url = `http://localhost/api/projects/${P}/x`
  if (method === "GET") return new Request(url)
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "x", name: "x", role: "po", orderedIds: ["a"] }),
  })
}

function call(c: HandlerCase): Promise<Response> {
  return c.handler(buildRequest(c.method), { params: Promise.resolve({ projectId: P, ...c.params }) })
}

/** Everything invoked other than the two authz lookups. */
function dataCalls(): string[] {
  return [...h.spies.entries()]
    .filter(([key, fn]) => fn.mock.calls.length > 0 && !h.AUTHZ_LOOKUPS.has(key.replace(/^prisma:/, "")))
    .map(([key]) => key)
}

const memberFindFirst = h.spyFor("prisma:projectMember.findFirst")
const sectionFindFirst = h.spyFor("prisma:projectSection.findFirst")

describe("project-scoped routes: authz table", () => {
  beforeEach(() => {
    for (const fn of h.spies.values()) fn.mockClear()
    h.auth.mockReset()
    memberFindFirst.mockReset().mockResolvedValue(null)
    sectionFindFirst.mockReset().mockResolvedValue(null)
  })

  it("covers every route.ts under projects/[projectId]", () => {
    const root = path.resolve(__dirname, "../projects/[projectId]")
    const onDisk = (fs.readdirSync(root, { recursive: true }) as string[])
      .map((p) => p.split(path.sep).join("/"))
      .filter((p) => p.endsWith("route.ts") && !p.includes("__tests__"))
      .sort()
    expect(ROUTES.map((r) => r.file).sort()).toEqual(onDisk)
  })

  it("found a handler for every route", () => {
    expect(HANDLERS.length).toBeGreaterThanOrEqual(ROUTES.length)
  })

  it("positive control: an allowed member reaches the service (detector is live)", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", name: "U", role: "member" } })
    memberFindFirst.mockResolvedValue({ role: "dev" })
    const c = HANDLERS.find((x) => x.name === "GET backlog/route.ts")!
    const res = await call(c)
    expect(res.status).toBe(500) // inert fake throws → mapped to 500
    expect(dataCalls()).toEqual(["backlog.service:listBacklog"])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 401 without a session", async (_n, c) => {
    h.auth.mockResolvedValue(null)
    const res = await call(c)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" })
    expect(memberFindFirst).not.toHaveBeenCalled()
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 401 for a session without user id", async (_n, c) => {
    h.auth.mockResolvedValue({ user: { name: "ghost" } })
    const res = await call(c)
    expect(res.status).toBe(401)
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))("%s → 404 for a non-member", async (_n, c) => {
    h.auth.mockResolvedValue({ user: { id: "outsider", name: "O", role: "member" } })
    const res = await call(c)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" })
    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { projectId: P, userId: "outsider" },
      select: { role: true },
    })
    expect(dataCalls()).toEqual([])
  })

  it.each(HANDLERS.map((c) => [c.name, c] as const))(
    "%s → 404 for a section manager of an unrelated section",
    async (_n, c) => {
      h.auth.mockResolvedValue({ user: { id: "sm-other", name: "S", role: "section_manager" } })
      const res = await call(c)
      expect(res.status).toBe(404)
      expect(sectionFindFirst).toHaveBeenCalledWith({
        where: { projectId: P, section: { users: { some: { userId: "sm-other" } } } },
        select: { sectionId: true },
      })
      expect(dataCalls()).toEqual([])
    }
  )
})

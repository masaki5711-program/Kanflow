import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const userCategories = {
  listUserCategories: vi.fn(),
  createUserCategory: vi.fn(),
  updateUserCategory: vi.fn(),
  deleteUserCategory: vi.fn(),
  assignProject: vi.fn(),
  unassignProject: vi.fn(),
}
vi.mock("@/services/user-categories/user-categories.service", () => userCategories)

const fixedTasks = {
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}
vi.mock("@/services/fixed-tasks/fixed-tasks.service", () => fixedTasks)

const account = {
  getLanguage: vi.fn(),
  setLanguage: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  searchUsers: vi.fn(),
}
vi.mock("@/services/users/account.service", () => account)

/**
 * Type-only: requireAuth/requireAdmin gates make tsc infer
 * `Promise<Response | undefined>` for handlers; at runtime they always return.
 */
type Defined<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => Promise<infer R> ? (...a: A) => Promise<NonNullable<R>> : T[K]
}
function defined<T>(mod: T): Defined<T> {
  return mod as Defined<T>
}

const categoriesRoute = defined(await import("@/app/api/user/categories/route"))
const categoryRoute = defined(await import("@/app/api/user/categories/[categoryId]/route"))
const assignmentsRoute = defined(await import("@/app/api/user/categories/[categoryId]/assignments/route"))
const fixedTasksRoute = defined(await import("@/app/api/user/fixed-tasks/route"))
const fixedTaskRoute = defined(await import("@/app/api/user/fixed-tasks/[taskId]/route"))
const itemsRoute = defined(await import("@/app/api/user/fixed-tasks/[taskId]/items/route"))
const itemRoute = defined(await import("@/app/api/user/fixed-tasks/[taskId]/items/[itemId]/route"))
const languageRoute = defined(await import("@/app/api/user/language/route"))
const passwordRoute = defined(await import("@/app/api/user/password/route"))
const profileRoute = defined(await import("@/app/api/user/profile/route"))

const BASE = "http://localhost/api/user"
const USER_ID = "user-1"
const cat = (categoryId = "c1") => ({ params: Promise.resolve({ categoryId }) })
const task = (taskId = "t1") => ({ params: Promise.resolve({ taskId }) })
const item = (taskId = "t1", itemId = "i1") => ({ params: Promise.resolve({ taskId, itemId }) })

function session(id = USER_ID) {
  return { user: { id, name: "U", email: "u@example.com", role: "member" } }
}
function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

const ENDPOINTS: Array<[string, () => Promise<Response>]> = [
  ["GET categories", () => categoriesRoute.GET()],
  ["POST categories", () => categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", { name: "a", color: "red" }))],
  ["PATCH categories/[id]", () => categoryRoute.PATCH(jsonReq(`${BASE}/categories/c1`, "PATCH", {}), cat())],
  ["DELETE categories/[id]", () => categoryRoute.DELETE(new Request(`${BASE}/categories/c1`), cat())],
  ["POST assignments", () => assignmentsRoute.POST(jsonReq(`${BASE}/categories/c1/assignments`, "POST", { projectId: "p1" }), cat())],
  ["DELETE assignments", () => assignmentsRoute.DELETE(new Request(`${BASE}/categories/c1/assignments?projectId=p1`), cat())],
  ["GET fixed-tasks", () => fixedTasksRoute.GET()],
  ["POST fixed-tasks", () => fixedTasksRoute.POST(jsonReq(`${BASE}/fixed-tasks`, "POST", { taskName: "x" }))],
  ["PATCH fixed-tasks/[id]", () => fixedTaskRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1`, "PATCH", {}), task())],
  ["DELETE fixed-tasks/[id]", () => fixedTaskRoute.DELETE(new Request(`${BASE}/fixed-tasks/t1`), task())],
  ["POST items", () => itemsRoute.POST(jsonReq(`${BASE}/fixed-tasks/t1/items`, "POST", { taskName: "x" }), task())],
  ["PATCH items/[id]", () => itemRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1/items/i1`, "PATCH", {}), item())],
  ["DELETE items/[id]", () => itemRoute.DELETE(new Request(`${BASE}/fixed-tasks/t1/items/i1`), item())],
  ["GET language", () => languageRoute.GET()],
  ["PATCH language", () => languageRoute.PATCH(jsonReq(`${BASE}/language`, "PATCH", { language: "ja" }))],
  ["POST password", () => passwordRoute.POST(jsonReq(`${BASE}/password`, "POST", { currentPassword: "a", newPassword: "abcdef" }))],
  ["GET profile", () => profileRoute.GET()],
  ["PATCH profile", () => profileRoute.PATCH(jsonReq(`${BASE}/profile`, "PATCH", { name: "n" }))],
]

const ALL_MOCKS = [...Object.values(userCategories), ...Object.values(fixedTasks), ...Object.values(account)]

function resetRateLimiters() {
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue(session())
  for (const m of ALL_MOCKS) m.mockReset()
  resetRateLimiters()
})

describe("user routes — authentication", () => {
  it.each(ENDPOINTS)("%s returns 401 without a session", async (_name, invoke) => {
    authMock.mockResolvedValue(null)
    const res = await invoke()
    expect(res.status).toBe(401)
    for (const m of ALL_MOCKS) expect(m).not.toHaveBeenCalled()
  })

  it.each(ENDPOINTS)("%s returns 401 for a session without a user id", async (_name, invoke) => {
    authMock.mockResolvedValue({ user: { name: "ghost" } })
    const res = await invoke()
    expect(res.status).toBe(401)
  })
})

describe("user categories", () => {
  it("GET lists the caller's categories only", async () => {
    userCategories.listUserCategories.mockResolvedValue([{ id: "c1" }])
    const res = await categoriesRoute.GET()
    expect(await res.json()).toEqual([{ id: "c1" }])
    expect(userCategories.listUserCategories).toHaveBeenCalledWith(USER_ID)
  })

  it("GET maps errors to 500", async () => {
    userCategories.listUserCategories.mockRejectedValue(new Error("x"))
    expect((await categoriesRoute.GET()).status).toBe(500)
  })

  it("POST creates with 201 scoped to the caller", async () => {
    userCategories.createUserCategory.mockResolvedValue({ id: "c2" })
    const res = await categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", { name: "Work", color: "blue" }))
    expect(res.status).toBe(201)
    expect(userCategories.createUserCategory).toHaveBeenCalledWith(USER_ID, { name: "Work", color: "blue" })
  })

  it.each([
    ["missing color", { name: "a" }],
    ["name too long", { name: "x".repeat(51), color: "red" }],
    ["empty name", { name: "", color: "red" }],
  ])("POST rejects %s with 400", async (_l, body) => {
    const res = await categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", body))
    expect(res.status).toBe(400)
    expect(userCategories.createUserCategory).not.toHaveBeenCalled()
  })

  it("POST rejects malformed JSON with 400", async () => {
    const res = await categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", "{"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid JSON", code: "INVALID_JSON" })
  })

  it("PATCH forwards owner + id, rejects non-integer sortOrder", async () => {
    userCategories.updateUserCategory.mockResolvedValue({ id: "c1" })
    const ok = await categoryRoute.PATCH(jsonReq(`${BASE}/categories/c1`, "PATCH", { sortOrder: 2 }), cat("c1"))
    expect(ok.status).toBe(200)
    expect(userCategories.updateUserCategory).toHaveBeenCalledWith(USER_ID, "c1", { sortOrder: 2 })

    const bad = await categoryRoute.PATCH(jsonReq(`${BASE}/categories/c1`, "PATCH", { sortOrder: 0.5 }), cat("c1"))
    expect(bad.status).toBe(400)
  })

  it("PATCH on another user's category surfaces the service's 404", async () => {
    userCategories.updateUserCategory.mockRejectedValue(new NotFoundError())
    const res = await categoryRoute.PATCH(jsonReq(`${BASE}/categories/c9`, "PATCH", {}), cat("c9"))
    expect(res.status).toBe(404)
  })

  it("DELETE removes and maps errors", async () => {
    userCategories.deleteUserCategory.mockResolvedValue(undefined)
    const ok = await categoryRoute.DELETE(new Request(`${BASE}/categories/c1`), cat("c1"))
    expect(await ok.json()).toEqual({ success: true })
    expect(userCategories.deleteUserCategory).toHaveBeenCalledWith(USER_ID, "c1")

    userCategories.deleteUserCategory.mockRejectedValue(new Error("x"))
    expect((await categoryRoute.DELETE(new Request(`${BASE}/categories/c1`), cat("c1"))).status).toBe(500)
  })

  it("assignment POST assigns a project with 201", async () => {
    userCategories.assignProject.mockResolvedValue({ categoryId: "c1", projectId: "p1" })
    const res = await assignmentsRoute.POST(jsonReq(`${BASE}/categories/c1/assignments`, "POST", { projectId: "p1" }), cat("c1"))
    expect(res.status).toBe(201)
    expect(userCategories.assignProject).toHaveBeenCalledWith(USER_ID, "c1", "p1")
  })

  it("assignment POST rejects an empty projectId and maps conflicts", async () => {
    const bad = await assignmentsRoute.POST(jsonReq(`${BASE}/categories/c1/assignments`, "POST", { projectId: "" }), cat("c1"))
    expect(bad.status).toBe(400)
    userCategories.assignProject.mockRejectedValue(new ConflictError("already"))
    const dup = await assignmentsRoute.POST(jsonReq(`${BASE}/categories/c1/assignments`, "POST", { projectId: "p1" }), cat("c1"))
    expect(dup.status).toBe(409)
  })

  it("assignment DELETE requires ?projectId", async () => {
    const res = await assignmentsRoute.DELETE(new Request(`${BASE}/categories/c1/assignments`), cat("c1"))
    expect(res.status).toBe(400)
    expect(userCategories.unassignProject).not.toHaveBeenCalled()
  })

  it("assignment DELETE unassigns and maps errors", async () => {
    userCategories.unassignProject.mockResolvedValue(undefined)
    const ok = await assignmentsRoute.DELETE(new Request(`${BASE}/categories/c1/assignments?projectId=p1`), cat("c1"))
    expect(await ok.json()).toEqual({ success: true })
    expect(userCategories.unassignProject).toHaveBeenCalledWith(USER_ID, "c1", "p1")
    userCategories.unassignProject.mockRejectedValue(new Error("x"))
    const err = await assignmentsRoute.DELETE(new Request(`${BASE}/categories/c1/assignments?projectId=p1`), cat("c1"))
    expect(err.status).toBe(500)
  })
})

describe("user fixed tasks", () => {
  it("GET lists caller's groups and maps errors", async () => {
    fixedTasks.listGroups.mockResolvedValue([])
    expect((await fixedTasksRoute.GET()).status).toBe(200)
    expect(fixedTasks.listGroups).toHaveBeenCalledWith(USER_ID)
    fixedTasks.listGroups.mockRejectedValue(new Error("x"))
    expect((await fixedTasksRoute.GET()).status).toBe(500)
  })

  it("POST creates a group, rejects empty / oversize names", async () => {
    fixedTasks.createGroup.mockResolvedValue({ id: "t1" })
    const ok = await fixedTasksRoute.POST(jsonReq(`${BASE}/fixed-tasks`, "POST", { taskName: "Mail" }))
    expect(ok.status).toBe(201)
    expect(fixedTasks.createGroup).toHaveBeenCalledWith(USER_ID, { taskName: "Mail" })

    expect((await fixedTasksRoute.POST(jsonReq(`${BASE}/fixed-tasks`, "POST", { taskName: "" }))).status).toBe(400)
    expect((await fixedTasksRoute.POST(jsonReq(`${BASE}/fixed-tasks`, "POST", { taskName: "x".repeat(201) }))).status).toBe(400)
  })

  it("PATCH / DELETE a group are owner scoped", async () => {
    fixedTasks.updateGroup.mockResolvedValue({ id: "t1" })
    const ok = await fixedTaskRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1`, "PATCH", { taskName: "M" }), task("t1"))
    expect(ok.status).toBe(200)
    expect(fixedTasks.updateGroup).toHaveBeenCalledWith(USER_ID, "t1", { taskName: "M" })

    fixedTasks.deleteGroup.mockResolvedValue(undefined)
    const del = await fixedTaskRoute.DELETE(new Request(`${BASE}/fixed-tasks/t1`), task("t1"))
    expect(await del.json()).toEqual({ success: true })
    expect(fixedTasks.deleteGroup).toHaveBeenCalledWith(USER_ID, "t1")
  })

  it("group PATCH/DELETE map not-found and failures", async () => {
    fixedTasks.updateGroup.mockRejectedValue(new NotFoundError())
    expect((await fixedTaskRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1`, "PATCH", {}), task())).status).toBe(404)
    expect((await fixedTaskRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1`, "PATCH", { sortOrder: "a" }), task())).status).toBe(400)
    fixedTasks.deleteGroup.mockRejectedValue(new Error("x"))
    expect((await fixedTaskRoute.DELETE(new Request(`${BASE}/fixed-tasks/t1`), task())).status).toBe(500)
  })

  it("items POST / PATCH / DELETE forward owner, task and item ids", async () => {
    fixedTasks.createItem.mockResolvedValue({ id: "i1" })
    const created = await itemsRoute.POST(jsonReq(`${BASE}/fixed-tasks/t1/items`, "POST", { taskName: "Sub" }), task("t1"))
    expect(created.status).toBe(201)
    expect(fixedTasks.createItem).toHaveBeenCalledWith(USER_ID, "t1", { taskName: "Sub" })

    fixedTasks.updateItem.mockResolvedValue({ id: "i1" })
    const patched = await itemRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1/items/i1`, "PATCH", { sortOrder: 3 }), item("t1", "i1"))
    expect(patched.status).toBe(200)
    expect(fixedTasks.updateItem).toHaveBeenCalledWith(USER_ID, "t1", "i1", { sortOrder: 3 })

    fixedTasks.deleteItem.mockResolvedValue(undefined)
    const deleted = await itemRoute.DELETE(new Request(`${BASE}/fixed-tasks/t1/items/i1`), item("t1", "i1"))
    expect(await deleted.json()).toEqual({ success: true })
    expect(fixedTasks.deleteItem).toHaveBeenCalledWith(USER_ID, "t1", "i1")
  })

  it("items map validation and service errors", async () => {
    expect((await itemsRoute.POST(jsonReq(`${BASE}/fixed-tasks/t1/items`, "POST", {}), task())).status).toBe(400)
    fixedTasks.createItem.mockRejectedValue(new NotFoundError())
    expect((await itemsRoute.POST(jsonReq(`${BASE}/fixed-tasks/t1/items`, "POST", { taskName: "a" }), task())).status).toBe(404)
    fixedTasks.updateItem.mockRejectedValue(new Error("x"))
    expect((await itemRoute.PATCH(jsonReq(`${BASE}/fixed-tasks/t1/items/i1`, "PATCH", {}), item())).status).toBe(500)
    fixedTasks.deleteItem.mockRejectedValue({ code: "P2025" })
    expect((await itemRoute.DELETE(new Request(`${BASE}/fixed-tasks/t1/items/i1`), item())).status).toBe(404)
  })
})

describe("user language", () => {
  it("GET returns the stored language", async () => {
    account.getLanguage.mockResolvedValue({ language: "id" })
    const res = await languageRoute.GET()
    expect(await res.json()).toEqual({ language: "id" })
    expect(account.getLanguage).toHaveBeenCalledWith(USER_ID)
  })

  it("GET maps errors to 500", async () => {
    account.getLanguage.mockRejectedValue(new Error("x"))
    expect((await languageRoute.GET()).status).toBe(500)
  })

  it.each(["ja", "en", "id"])("PATCH accepts %s", async (language) => {
    account.setLanguage.mockResolvedValue({ language })
    const res = await languageRoute.PATCH(jsonReq(`${BASE}/language`, "PATCH", { language }))
    expect(res.status).toBe(200)
    expect(account.setLanguage).toHaveBeenCalledWith(USER_ID, language)
  })

  it.each([["unsupported", { language: "fr" }], ["missing", {}], ["malformed", "{"]])(
    "PATCH rejects %s language with 400",
    async (_l, body) => {
      const res = await languageRoute.PATCH(jsonReq(`${BASE}/language`, "PATCH", body))
      expect(res.status).toBe(400)
      expect(account.setLanguage).not.toHaveBeenCalled()
    }
  )

  it("PATCH maps errors to 500", async () => {
    account.setLanguage.mockRejectedValue(new Error("x"))
    expect((await languageRoute.PATCH(jsonReq(`${BASE}/language`, "PATCH", { language: "ja" }))).status).toBe(500)
  })
})

describe("user profile", () => {
  it("GET returns the caller's profile", async () => {
    account.getProfile.mockResolvedValue({ name: "U" })
    const res = await profileRoute.GET()
    expect(await res.json()).toEqual({ name: "U" })
    expect(account.getProfile).toHaveBeenCalledWith(USER_ID)
  })

  it("GET maps NotFound to 404", async () => {
    account.getProfile.mockRejectedValue(new NotFoundError())
    expect((await profileRoute.GET()).status).toBe(404)
  })

  it("PATCH updates allowed fields and strips email/role", async () => {
    account.updateProfile.mockResolvedValue({ name: "New" })
    const res = await profileRoute.PATCH(
      jsonReq(`${BASE}/profile`, "PATCH", { name: "New", department: null, role: "admin", email: "x@y.z" })
    )
    expect(res.status).toBe(200)
    expect(account.updateProfile).toHaveBeenCalledWith(USER_ID, { name: "New", department: null })
  })

  it("PATCH rejects invalid input and maps errors", async () => {
    expect((await profileRoute.PATCH(jsonReq(`${BASE}/profile`, "PATCH", { name: "" }))).status).toBe(400)
    expect((await profileRoute.PATCH(jsonReq(`${BASE}/profile`, "PATCH", "{"))).status).toBe(400)
    account.updateProfile.mockRejectedValue(new Error("x"))
    expect((await profileRoute.PATCH(jsonReq(`${BASE}/profile`, "PATCH", { name: "a" }))).status).toBe(500)
  })
})

describe("user password (rate limited)", () => {
  const body = { currentPassword: "old", newPassword: "newpass1" }
  const post = (b: unknown = body) => passwordRoute.POST(jsonReq(`${BASE}/password`, "POST", b))

  it("changes the password on success", async () => {
    account.changePassword.mockResolvedValue("ok")
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(account.changePassword).toHaveBeenCalledWith(USER_ID, "old", "newpass1")
  })

  it.each([
    ["short new password", { currentPassword: "old", newPassword: "12345" }],
    ["empty current password", { currentPassword: "", newPassword: "123456" }],
    ["malformed body", "{"],
  ])("rejects %s with 400", async (_l, b) => {
    const res = await post(b)
    expect(res.status).toBe(400)
    expect(account.changePassword).not.toHaveBeenCalled()
  })

  it("returns 401 for a wrong current password", async () => {
    account.changePassword.mockResolvedValue("wrong_password")
    const res = await post()
    expect(res.status).toBe(401)
  })

  it("returns 429 with Retry-After after 5 wrong current passwords, without calling the service", async () => {
    account.changePassword.mockResolvedValue("wrong_password")
    for (let i = 0; i < 5; i++) expect((await post()).status).toBe(401)
    expect(account.changePassword).toHaveBeenCalledTimes(5)

    const limited = await post()
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(account.changePassword).toHaveBeenCalledTimes(5)
  })

  it("limits per user: another user is unaffected", async () => {
    account.changePassword.mockResolvedValue("wrong_password")
    for (let i = 0; i < 5; i++) await post()
    expect((await post()).status).toBe(429)

    authMock.mockResolvedValue(session("user-2"))
    account.changePassword.mockResolvedValue("ok")
    expect((await post()).status).toBe(200)
  })

  it("a successful change resets the failure counter", async () => {
    account.changePassword.mockResolvedValue("wrong_password")
    for (let i = 0; i < 4; i++) await post()
    account.changePassword.mockResolvedValueOnce("ok")
    expect((await post()).status).toBe(200)
    for (let i = 0; i < 4; i++) expect((await post()).status).toBe(401)
    expect((await post()).status).toBe(401)
    expect((await post()).status).toBe(429)
  })

  it("maps service errors to 500 without counting them", async () => {
    account.changePassword.mockRejectedValue(new Error("db"))
    const res = await post()
    expect(res.status).toBe(500)
  })
})

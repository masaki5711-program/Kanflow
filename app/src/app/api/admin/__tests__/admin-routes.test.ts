import { beforeEach, describe, expect, it, vi } from "vitest"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const categories = {
  listAdminCategories: vi.fn(),
  createAdminCategory: vi.fn(),
  updateAdminCategory: vi.fn(),
  deleteAdminCategory: vi.fn(),
}
vi.mock("@/services/categories/categories.service", () => categories)

const sections = {
  listSections: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  listSectionOptions: vi.fn(),
}
vi.mock("@/services/sections/sections.service", () => sections)

const glossary = {
  listTerms: vi.fn(),
  createTerm: vi.fn(),
  retranslate: vi.fn(),
  updateTerm: vi.fn(),
  deleteTerm: vi.fn(),
}
vi.mock("@/services/glossary/glossary.service", () => glossary)

const translationsAdmin = {
  purgeOrphans: vi.fn(),
  retryFailed: vi.fn(),
  queueCounts: vi.fn(),
}
vi.mock("@/services/translations-admin/translations-admin.service", () => translationsAdmin)

const ollamaReachable = vi.fn()
const workerStatus = vi.fn()
const gateStatus = vi.fn()
vi.mock("@/lib/ollama", () => ({ OLLAMA_MODELS: { translate: "test-model" } }))
vi.mock("@/lib/translation/translator", () => ({ ollamaReachable: () => ollamaReachable() }))
vi.mock("@/lib/translation/worker", () => ({ workerStatus: () => workerStatus() }))
vi.mock("@/lib/translation/priority-gate", () => ({ gate: { status: () => gateStatus() } }))

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

const categoriesRoute = defined(await import("@/app/api/admin/categories/route"))
const categoryRoute = defined(await import("@/app/api/admin/categories/[id]/route"))
const sectionsRoute = defined(await import("@/app/api/admin/sections/route"))
const sectionRoute = defined(await import("@/app/api/admin/sections/[id]/route"))
const glossaryRoute = defined(await import("@/app/api/admin/glossary/route"))
const glossaryItemRoute = defined(await import("@/app/api/admin/glossary/[id]/route"))
const purgeRoute = defined(await import("@/app/api/admin/translations/purge-orphans/route"))
const retryRoute = defined(await import("@/app/api/admin/translations/retry-failed/route"))
const statsRoute = defined(await import("@/app/api/admin/translations/stats/route"))

const BASE = "http://localhost/api/admin"
const idParams = (id = "x1") => ({ params: Promise.resolve({ id }) })

function adminSession() {
  return { user: { id: "admin-1", name: "Admin", email: "a@example.com", role: "admin" } }
}
function memberSession() {
  return { user: { id: "user-1", name: "U", email: "u@example.com", role: "member" } }
}
function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
}

type Invoke = () => Promise<Response>

/** Every admin endpoint, invoked with a benign body. */
const ADMIN_ENDPOINTS: Array<[string, Invoke]> = [
  ["GET categories", () => categoriesRoute.GET(new Request(`${BASE}/categories`))],
  ["POST categories", () => categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", { name: "c" }))],
  ["PATCH categories/[id]", () => categoryRoute.PATCH(jsonReq(`${BASE}/categories/x1`, "PATCH", {}), idParams())],
  ["DELETE categories/[id]", () => categoryRoute.DELETE(new Request(`${BASE}/categories/x1`), idParams())],
  ["GET sections", () => sectionsRoute.GET()],
  ["POST sections", () => sectionsRoute.POST(jsonReq(`${BASE}/sections`, "POST", { name: "s" }))],
  ["PATCH sections/[id]", () => sectionRoute.PATCH(jsonReq(`${BASE}/sections/x1`, "PATCH", {}), idParams())],
  ["DELETE sections/[id]", () => sectionRoute.DELETE(new Request(`${BASE}/sections/x1`), idParams())],
  ["GET glossary", () => glossaryRoute.GET(new Request(`${BASE}/glossary`))],
  ["POST glossary", () => glossaryRoute.POST(jsonReq(`${BASE}/glossary`, "POST", {}))],
  ["PUT glossary", () => glossaryRoute.PUT(jsonReq(`${BASE}/glossary`, "PUT", {}))],
  ["PATCH glossary/[id]", () => glossaryItemRoute.PATCH(jsonReq(`${BASE}/glossary/x1`, "PATCH", {}), idParams())],
  ["DELETE glossary/[id]", () => glossaryItemRoute.DELETE(new Request(`${BASE}/glossary/x1`), idParams())],
  ["POST purge-orphans", () => purgeRoute.POST(jsonReq(`${BASE}/translations/purge-orphans`, "POST", {}))],
  ["POST retry-failed", () => retryRoute.POST()],
  ["GET stats", () => statsRoute.GET()],
]

const ALL_SERVICE_MOCKS = [
  ...Object.values(categories),
  ...Object.values(sections),
  ...Object.values(glossary),
  ...Object.values(translationsAdmin),
]

beforeEach(() => {
  authMock.mockReset().mockResolvedValue(adminSession())
  for (const m of ALL_SERVICE_MOCKS) m.mockReset()
  ollamaReachable.mockReset().mockResolvedValue(true)
  workerStatus.mockReset().mockReturnValue({ idle: true, enabled: true, mode: "external", started: false })
  gateStatus.mockReset().mockReturnValue({ high_active: 1, background_active: 0 })
})

describe("admin routes — access control", () => {
  it.each(ADMIN_ENDPOINTS)("%s returns 401 without a session", async (_name, invoke) => {
    authMock.mockResolvedValue(null)
    const res = await invoke()
    expect(res.status).toBe(401)
    for (const m of ALL_SERVICE_MOCKS) expect(m).not.toHaveBeenCalled()
  })

  it.each(ADMIN_ENDPOINTS)("%s returns 403 for a non-admin", async (_name, invoke) => {
    authMock.mockResolvedValue(memberSession())
    const res = await invoke()
    expect(res.status).toBe(403)
    for (const m of ALL_SERVICE_MOCKS) expect(m).not.toHaveBeenCalled()
  })

  it("returns 403 for a section manager as well", async () => {
    authMock.mockResolvedValue({ user: { id: "sm", role: "section_manager" } })
    const res = await sectionsRoute.GET()
    expect(res.status).toBe(403)
  })
})

describe("admin categories", () => {
  it("GET without sectionId lists all categories", async () => {
    categories.listAdminCategories.mockResolvedValue([{ id: "c1" }])
    const res = await categoriesRoute.GET(new Request(`${BASE}/categories`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: "c1" }])
    expect(categories.listAdminCategories).toHaveBeenCalledWith({ kind: "all" })
  })

  it("GET with empty sectionId lists global only; with an id lists that section", async () => {
    categories.listAdminCategories.mockResolvedValue([])
    await categoriesRoute.GET(new Request(`${BASE}/categories?sectionId=`))
    expect(categories.listAdminCategories).toHaveBeenLastCalledWith({ kind: "global" })
    await categoriesRoute.GET(new Request(`${BASE}/categories?sectionId=s9`))
    expect(categories.listAdminCategories).toHaveBeenLastCalledWith({ kind: "section", sectionId: "s9" })
  })

  it("GET maps unexpected errors to 500 with the fallback code", async () => {
    categories.listAdminCategories.mockRejectedValue(new Error("db down"))
    const res = await categoriesRoute.GET(new Request(`${BASE}/categories`))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "list_failed", code: "INTERNAL" })
  })

  it("POST creates with 201", async () => {
    categories.createAdminCategory.mockResolvedValue({ id: "c2", name: "New" })
    const res = await categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", { name: "New", sectionId: null }))
    expect(res.status).toBe(201)
    expect(categories.createAdminCategory).toHaveBeenCalledWith({ name: "New", sectionId: null })
  })

  it.each([
    ["empty name", { name: "" }],
    ["too long name", { name: "x".repeat(101) }],
    ["non-integer sortOrder", { name: "a", sortOrder: 1.5 }],
    ["malformed JSON", "{not json"],
  ])("POST rejects %s with 400", async (_label, body) => {
    const res = await categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "invalid_request", code: "VALIDATION" })
    expect(categories.createAdminCategory).not.toHaveBeenCalled()
  })

  it("POST maps a ConflictError to 409", async () => {
    categories.createAdminCategory.mockRejectedValue(new ConflictError("duplicate"))
    const res = await categoriesRoute.POST(jsonReq(`${BASE}/categories`, "POST", { name: "dup" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "duplicate", code: "CONFLICT" })
  })

  it("PATCH updates by id", async () => {
    categories.updateAdminCategory.mockResolvedValue({ id: "c1", name: "R" })
    const res = await categoryRoute.PATCH(jsonReq(`${BASE}/categories/c1`, "PATCH", { name: "R" }), idParams("c1"))
    expect(res.status).toBe(200)
    expect(categories.updateAdminCategory).toHaveBeenCalledWith("c1", { name: "R" })
  })

  it("PATCH rejects invalid body with 400", async () => {
    const res = await categoryRoute.PATCH(jsonReq(`${BASE}/categories/c1`, "PATCH", { color: "x".repeat(51) }), idParams("c1"))
    expect(res.status).toBe(400)
  })

  it("PATCH maps NotFoundError to 404", async () => {
    categories.updateAdminCategory.mockRejectedValue(new NotFoundError())
    const res = await categoryRoute.PATCH(jsonReq(`${BASE}/categories/c1`, "PATCH", {}), idParams("c1"))
    expect(res.status).toBe(404)
  })

  it("DELETE returns ok and maps prisma P2025 to 404", async () => {
    categories.deleteAdminCategory.mockResolvedValue(undefined)
    const ok = await categoryRoute.DELETE(new Request(`${BASE}/categories/c1`), idParams("c1"))
    expect(await ok.json()).toEqual({ ok: true })
    expect(categories.deleteAdminCategory).toHaveBeenCalledWith("c1")

    categories.deleteAdminCategory.mockRejectedValue({ code: "P2025" })
    const missing = await categoryRoute.DELETE(new Request(`${BASE}/categories/c1`), idParams("c1"))
    expect(missing.status).toBe(404)
  })
})

describe("admin sections", () => {
  it("GET lists sections", async () => {
    sections.listSections.mockResolvedValue([{ id: "s1" }])
    const res = await sectionsRoute.GET()
    expect(await res.json()).toEqual([{ id: "s1" }])
  })

  it("GET maps failures to 500", async () => {
    sections.listSections.mockRejectedValue(new Error("x"))
    const res = await sectionsRoute.GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "list_failed", code: "INTERNAL" })
  })

  it("POST creates with 201 and rejects bad input with 400", async () => {
    sections.createSection.mockResolvedValue({ id: "s2" })
    const ok = await sectionsRoute.POST(jsonReq(`${BASE}/sections`, "POST", { name: "Sec", description: "d" }))
    expect(ok.status).toBe(201)
    expect(sections.createSection).toHaveBeenCalledWith({ name: "Sec", description: "d" })

    const bad = await sectionsRoute.POST(jsonReq(`${BASE}/sections`, "POST", { description: "x".repeat(501) }))
    expect(bad.status).toBe(400)
  })

  it("POST maps a service conflict to 409", async () => {
    sections.createSection.mockRejectedValue(new ConflictError("exists"))
    const res = await sectionsRoute.POST(jsonReq(`${BASE}/sections`, "POST", { name: "Sec" }))
    expect(res.status).toBe(409)
  })

  it("PATCH allows nulling the description", async () => {
    sections.updateSection.mockResolvedValue({ id: "s1" })
    const res = await sectionRoute.PATCH(jsonReq(`${BASE}/sections/s1`, "PATCH", { description: null }), idParams("s1"))
    expect(res.status).toBe(200)
    expect(sections.updateSection).toHaveBeenCalledWith("s1", { description: null })
  })

  it("PATCH rejects bad input and maps errors", async () => {
    const bad = await sectionRoute.PATCH(jsonReq(`${BASE}/sections/s1`, "PATCH", { name: "" }), idParams("s1"))
    expect(bad.status).toBe(400)
    sections.updateSection.mockRejectedValue(new Error("boom"))
    const err = await sectionRoute.PATCH(jsonReq(`${BASE}/sections/s1`, "PATCH", {}), idParams("s1"))
    expect(err.status).toBe(500)
    expect(await err.json()).toEqual({ error: "update_failed", code: "INTERNAL" })
  })

  it("DELETE returns ok and maps errors", async () => {
    sections.deleteSection.mockResolvedValue(undefined)
    const ok = await sectionRoute.DELETE(new Request(`${BASE}/sections/s1`), idParams("s1"))
    expect(await ok.json()).toEqual({ ok: true })
    sections.deleteSection.mockRejectedValue(new Error("boom"))
    const err = await sectionRoute.DELETE(new Request(`${BASE}/sections/s1`), idParams("s1"))
    expect(await err.json()).toEqual({ error: "delete_failed", code: "INTERNAL" })
  })
})

describe("admin glossary", () => {
  it("GET parses query params with defaults", async () => {
    glossary.listTerms.mockResolvedValue({ items: [], total: 0 })
    const res = await glossaryRoute.GET(new Request(`${BASE}/glossary?q=foo&source=ja`))
    expect(res.status).toBe(200)
    expect(glossary.listTerms).toHaveBeenCalledWith({ q: "foo", source: "ja", limit: 50, offset: 0 })
  })

  it.each([
    ["limit above max", "limit=201"],
    ["negative offset", "offset=-1"],
    ["unknown source locale", "source=en"],
  ])("GET rejects %s with 400", async (_label, qs) => {
    const res = await glossaryRoute.GET(new Request(`${BASE}/glossary?${qs}`))
    expect(res.status).toBe(400)
    expect(glossary.listTerms).not.toHaveBeenCalled()
  })

  it("GET maps failures to 500", async () => {
    glossary.listTerms.mockRejectedValue(new Error("x"))
    const res = await glossaryRoute.GET(new Request(`${BASE}/glossary`))
    expect(res.status).toBe(500)
  })

  it("POST creates a term attributed to the admin", async () => {
    const input = { sourceLocale: "ja", targetLocale: "id", term: "課", translation: "Seksi" }
    glossary.createTerm.mockResolvedValue({ id: "g1", ...input })
    const res = await glossaryRoute.POST(jsonReq(`${BASE}/glossary`, "POST", input))
    expect(res.status).toBe(201)
    expect(glossary.createTerm).toHaveBeenCalledWith(input, "admin-1")
  })

  it("POST returns 400 with zod issues for invalid input, and for malformed JSON", async () => {
    const res = await glossaryRoute.POST(jsonReq(`${BASE}/glossary`, "POST", { sourceLocale: "en", term: "" }))
    expect(res.status).toBe(400)
    expect(Array.isArray((await res.json()).error)).toBe(true)

    const malformed = await glossaryRoute.POST(jsonReq(`${BASE}/glossary`, "POST", "{bad"))
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({ error: "Invalid JSON", code: "INVALID_JSON" })
  })

  it("PUT retranslates given ids; an empty / unparsable body means all", async () => {
    glossary.retranslate.mockResolvedValue({ queued: 3 })
    const res = await glossaryRoute.PUT(jsonReq(`${BASE}/glossary`, "PUT", { ids: ["g1", "g2"] }))
    expect(await res.json()).toEqual({ queued: 3 })
    expect(glossary.retranslate).toHaveBeenLastCalledWith(["g1", "g2"])

    await glossaryRoute.PUT(jsonReq(`${BASE}/glossary`, "PUT", "garbage"))
    expect(glossary.retranslate).toHaveBeenLastCalledWith(undefined)
  })

  it("PUT rejects more than 500 ids", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `g${i}`)
    const res = await glossaryRoute.PUT(jsonReq(`${BASE}/glossary`, "PUT", { ids }))
    expect(res.status).toBe(400)
    expect(glossary.retranslate).not.toHaveBeenCalled()
  })

  it("PUT maps service errors to 500", async () => {
    glossary.retranslate.mockRejectedValue(new Error("x"))
    const res = await glossaryRoute.PUT(jsonReq(`${BASE}/glossary`, "PUT", {}))
    expect(res.status).toBe(500)
  })

  it("PATCH updates a term with the admin id", async () => {
    glossary.updateTerm.mockResolvedValue({ id: "g1" })
    const res = await glossaryItemRoute.PATCH(jsonReq(`${BASE}/glossary/g1`, "PATCH", { note: null }), idParams("g1"))
    expect(res.status).toBe(200)
    expect(glossary.updateTerm).toHaveBeenCalledWith("g1", { note: null }, "admin-1")
  })

  it("PATCH rejects invalid input and maps NotFound", async () => {
    const bad = await glossaryItemRoute.PATCH(jsonReq(`${BASE}/glossary/g1`, "PATCH", { term: "" }), idParams("g1"))
    expect(bad.status).toBe(400)
    glossary.updateTerm.mockRejectedValue(new NotFoundError("用語が見つかりません"))
    const missing = await glossaryItemRoute.PATCH(jsonReq(`${BASE}/glossary/g1`, "PATCH", {}), idParams("g1"))
    expect(missing.status).toBe(404)
  })

  it("DELETE removes a term and maps errors", async () => {
    glossary.deleteTerm.mockResolvedValue(undefined)
    const ok = await glossaryItemRoute.DELETE(new Request(`${BASE}/glossary/g1`), idParams("g1"))
    expect(await ok.json()).toEqual({ success: true })
    expect(glossary.deleteTerm).toHaveBeenCalledWith("g1")
    glossary.deleteTerm.mockRejectedValue(new Error("x"))
    const err = await glossaryItemRoute.DELETE(new Request(`${BASE}/glossary/g1`), idParams("g1"))
    expect(err.status).toBe(500)
  })
})

describe("admin translations", () => {
  it("purge-orphans accepts an empty body (defaults) and passes the admin id", async () => {
    translationsAdmin.purgeOrphans.mockResolvedValue({ dryRun: false, byEntity: {}, total: 0 })
    const res = await purgeRoute.POST(new Request(`${BASE}/translations/purge-orphans`, { method: "POST" }))
    expect(res.status).toBe(200)
    expect(translationsAdmin.purgeOrphans).toHaveBeenCalledWith({}, "admin-1")
  })

  it("purge-orphans forwards dryRun", async () => {
    translationsAdmin.purgeOrphans.mockResolvedValue({ dryRun: true, byEntity: { backlog: 2 }, total: 2 })
    const res = await purgeRoute.POST(jsonReq(`${BASE}/translations/purge-orphans`, "POST", { dryRun: true }))
    expect(await res.json()).toEqual({ dryRun: true, byEntity: { backlog: 2 }, total: 2 })
    expect(translationsAdmin.purgeOrphans).toHaveBeenCalledWith({ dryRun: true }, "admin-1")
  })

  it("purge-orphans rejects malformed JSON and wrong types with 400", async () => {
    const malformed = await purgeRoute.POST(jsonReq(`${BASE}/translations/purge-orphans`, "POST", "{oops"))
    expect(malformed.status).toBe(400)
    const wrongType = await purgeRoute.POST(jsonReq(`${BASE}/translations/purge-orphans`, "POST", { dryRun: "yes" }))
    expect(wrongType.status).toBe(400)
    expect(translationsAdmin.purgeOrphans).not.toHaveBeenCalled()
  })

  it("purge-orphans maps service failure to 500", async () => {
    translationsAdmin.purgeOrphans.mockRejectedValue(new Error("x"))
    const res = await purgeRoute.POST(jsonReq(`${BASE}/translations/purge-orphans`, "POST", {}))
    expect(res.status).toBe(500)
  })

  it("retry-failed returns the service result and maps errors", async () => {
    translationsAdmin.retryFailed.mockResolvedValue({ requeued: 4 })
    const ok = await retryRoute.POST()
    expect(await ok.json()).toEqual({ requeued: 4 })
    translationsAdmin.retryFailed.mockRejectedValue(new Error("x"))
    const err = await retryRoute.POST()
    expect(err.status).toBe(500)
  })

  it("stats combines queue counts, worker, gate and Ollama status", async () => {
    translationsAdmin.queueCounts.mockResolvedValue({ pending: 2, processing: 0, done: 10, failed: 1 })
    ollamaReachable.mockResolvedValue(false)
    const res = await statsRoute.GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      pending: 2,
      failed: 1,
      workerIdle: true,
      workerEnabled: true,
      workerMode: "external",
      highActive: 1,
      backgroundActive: 0,
      ollamaReachable: false,
      model: "test-model",
    })
    expect(typeof body.workerLocation).toBe("string")
  })
})

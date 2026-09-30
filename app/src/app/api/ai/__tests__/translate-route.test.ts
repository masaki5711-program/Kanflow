import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const ftFindUnique = vi.fn()
const ftUpdateMany = vi.fn()
const translateText = vi.fn()
const findGlossaryForText = vi.fn()
const bumpGlossaryUsage = vi.fn()
const resolveEntityScope = vi.fn()
const loadProjectActor = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    fieldTranslation: {
      findUnique: (...a: unknown[]) => ftFindUnique(...a),
      updateMany: (...a: unknown[]) => ftUpdateMany(...a),
    },
  },
}))
vi.mock("@/services/_shared/entity-scope", () => ({
  resolveEntityScope: (...a: unknown[]) => resolveEntityScope(...a),
}))
vi.mock("@/lib/authz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authz")>()),
  loadProjectActor: (...a: unknown[]) => loadProjectActor(...a),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s: string) => s }))
vi.mock("@/lib/translation/translator", () => ({
  translateText: (...a: unknown[]) => translateText(...a),
}))
vi.mock("@/lib/translation/glossary-service", () => ({
  findGlossaryForText: (...a: unknown[]) => findGlossaryForText(...a),
  bumpGlossaryUsage: (...a: unknown[]) => bumpGlossaryUsage(...a),
}))

const route = await import("../translate/route")
const POST = async (r: Request): Promise<Response> => {
  const res = await route.POST(r)
  if (!res) throw new Error("no response")
  return res
}
const { OllamaAbortedError, OllamaUnavailableError } = await import("@/lib/ollama/errors")

function req(body: unknown, raw = false) {
  return new Request("http://localhost/api/ai/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

const result = {
  translated: "Halo",
  sourceLocale: "ja",
  targetLocale: "id",
  modelUsed: "qwen",
  glossaryApplied: ["x"],
  glossaryMisses: [],
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1", role: "member" } })
  ftFindUnique.mockReset()
  ftUpdateMany.mockReset().mockResolvedValue({ count: 1 })
  translateText.mockReset().mockResolvedValue(result)
  findGlossaryForText.mockReset().mockResolvedValue([])
  bumpGlossaryUsage.mockReset().mockResolvedValue(undefined)
  resolveEntityScope.mockReset().mockResolvedValue({ kind: "project", projectId: "p1" })
  loadProjectActor.mockReset().mockResolvedValue({
    userId: "u1",
    systemRole: "member",
    projectRole: "dev",
    isSectionManagerOfProject: false,
  })
})

describe("POST /api/ai/translate — ad hoc", () => {
  it("401 without session", async () => {
    authMock.mockResolvedValue(null)
    expect((await POST(req({ text: "a", targetLocale: "id" }))).status).toBe(401)
    expect(translateText).not.toHaveBeenCalled()
  })

  it("400 on invalid JSON", async () => {
    expect((await POST(req("{nope", true))).status).toBe(400)
  })

  it("400 on schema failure (empty text, bad locale)", async () => {
    expect((await POST(req({ text: "", targetLocale: "id" }))).status).toBe(400)
    expect((await POST(req({ text: "a", targetLocale: "en" }))).status).toBe(400)
    expect((await POST(req({ text: "x".repeat(20001), targetLocale: "id" }))).status).toBe(400)
  })

  it("translates without glossary when no source locale", async () => {
    const res = await POST(req({ text: "こんにちは", targetLocale: "id" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      translated: "Halo",
      source_locale: "ja",
      target_locale: "id",
      model_used: "qwen",
      fallback_used: false,
      glossary_applied: ["x"],
      glossary_misses: [],
    })
    expect(findGlossaryForText).not.toHaveBeenCalled()
    expect(translateText.mock.calls[0][0]).toMatchObject({ text: "こんにちは", targetLocale: "id", glossary: [] })
  })

  it("uses glossary when source locale given", async () => {
    findGlossaryForText.mockResolvedValue([{ term: "a", translation: "b" }])
    await POST(req({ text: "t", sourceLocale: "ja", targetLocale: "id" }))
    expect(findGlossaryForText).toHaveBeenCalledWith("t", "ja", "id")
    expect(translateText.mock.calls[0][0].glossary).toEqual([{ term: "a", translation: "b" }])
  })

  it("maps Ollama errors to their HTTP status", async () => {
    translateText.mockRejectedValue(new OllamaUnavailableError())
    const res = await POST(req({ text: "t", targetLocale: "id" }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("ollama_unavailable")

    translateText.mockRejectedValue(new OllamaAbortedError())
    expect((await POST(req({ text: "t", targetLocale: "id" }))).status).toBe(499)
  })

  it("maps generic errors to 502", async () => {
    translateText.mockRejectedValue("boom")
    const res = await POST(req({ text: "t", targetLocale: "id" }))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ code: "translation_failed", detail: "boom" })
  })
})

describe("POST /api/ai/translate — stored row", () => {
  const key = { entityType: "backlog_item", entityId: "b1", field: "title" }
  const row = {
    ...key,
    sourceLocale: "ja",
    textJa: "タイトル",
    textId: null,
    sourceHash: "h1",
    attempts: 2,
  }

  it("400 for unknown entity type", async () => {
    const res = await POST(req({ entityType: "user", entityId: "x", field: "password" }))
    expect(res.status).toBe(400)
    expect(ftFindUnique).not.toHaveBeenCalled()
  })

  it("404 (no row lookup) when the entity is in a project the caller cannot view", async () => {
    loadProjectActor.mockResolvedValue({ userId: "u1", systemRole: "member", projectRole: null, isSectionManagerOfProject: false })
    const res = await POST(req(key))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" })
    expect(loadProjectActor).toHaveBeenCalledWith("u1", "member", "p1")
    expect(ftFindUnique).not.toHaveBeenCalled()
    expect(translateText).not.toHaveBeenCalled()
  })

  it("404 when the entity does not exist", async () => {
    resolveEntityScope.mockResolvedValue(null)
    expect((await POST(req(key))).status).toBe(404)
    expect(ftFindUnique).not.toHaveBeenCalled()
  })

  it("404 for another user's personal fixed task; owner may translate", async () => {
    const fixed = { entityType: "fixed_task", entityId: "g1", field: "taskName" }
    resolveEntityScope.mockResolvedValue({ kind: "user", userId: "someone-else" })
    expect((await POST(req(fixed))).status).toBe(404)
    expect(ftFindUnique).not.toHaveBeenCalled()
    resolveEntityScope.mockResolvedValue({ kind: "user", userId: "u1" })
    ftFindUnique.mockResolvedValue({ ...row, ...fixed })
    expect((await POST(req(fixed))).status).toBe(200)
  })

  it("admits system admins without membership", async () => {
    authMock.mockResolvedValue({ user: { id: "a1", role: "admin" } })
    loadProjectActor.mockResolvedValue({ userId: "a1", systemRole: "admin", projectRole: null, isSectionManagerOfProject: false })
    ftFindUnique.mockResolvedValue(row)
    expect((await POST(req(key))).status).toBe(200)
  })

  it("404 when row missing", async () => {
    ftFindUnique.mockResolvedValue(null)
    expect((await POST(req(key))).status).toBe(404)
    expect(ftFindUnique).toHaveBeenCalledWith({ where: { entityType_entityId_field: key } })
  })

  it("409 when source text missing", async () => {
    ftFindUnique.mockResolvedValue({ ...row, textJa: null })
    expect((await POST(req(key))).status).toBe(409)
  })

  it("502 on empty translation", async () => {
    ftFindUnique.mockResolvedValue(row)
    translateText.mockResolvedValue({ ...result, translated: "  " })
    expect((await POST(req(key))).status).toBe(502)
    expect(ftUpdateMany).not.toHaveBeenCalled()
  })

  it("stores ja→id translation guarded by sourceHash and bumps glossary", async () => {
    ftFindUnique.mockResolvedValue(row)
    findGlossaryForText.mockResolvedValue([{ id: "g1", term: "a", translation: "b", extra: 1 }])
    const res = await POST(req(key))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.i18n.title).toEqual({ ja: "タイトル", id: "Halo", source: "ja", status: "done" })
    expect(translateText.mock.calls[0][0].glossary).toEqual([{ term: "a", translation: "b" }])
    const call = ftUpdateMany.mock.calls[0][0]
    expect(call.where).toEqual({ ...key, sourceHash: "h1" })
    expect(call.data).toMatchObject({ status: "done", textId: "Halo", attempts: 2, model: "qwen" })
    expect(call.data.textJa).toBeUndefined()
    expect(bumpGlossaryUsage).toHaveBeenCalledWith(["g1"])
  })

  it("stores id→ja translation", async () => {
    ftFindUnique.mockResolvedValue({ ...row, sourceLocale: "id", textJa: null, textId: "Judul" })
    translateText.mockResolvedValue({ ...result, translated: "題名" })
    const body = await (await POST(req(key))).json()
    expect(body.i18n.title).toEqual({ ja: "題名", id: "Judul", source: "id", status: "done" })
    expect(ftUpdateMany.mock.calls[0][0].data.textJa).toBe("題名")
    expect(bumpGlossaryUsage).not.toHaveBeenCalled()
  })

  it("maps errors during row translation", async () => {
    ftFindUnique.mockResolvedValue(row)
    translateText.mockRejectedValue(new Error("x"))
    expect((await POST(req(key))).status).toBe(502)
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/attachments/attachments.service", () => ({
  createLink: vi.fn(),
}))

const svc = await import("@/services/attachments/attachments.service")
const route = await import("@/app/api/projects/[projectId]/attachments/links/route")
const { ValidationError, NotFoundError } = await import("@/services/_shared")

beforeEach(() => {
  vi.mocked(svc.createLink).mockReset()
})

describe("POST /attachments/links", () => {
  it("creates a link entry (201)", async () => {
    asRole("dev")
    vi.mocked(svc.createLink).mockResolvedValue({ id: "lnk1", linkUrl: "https://example.com/" } as never)
    const res = await route.POST(req("POST", { url: "https://example.com" }), ctx())
    expect(await read(res)).toEqual({ status: 201, body: { id: "lnk1", linkUrl: "https://example.com/" } })
    expect(svc.createLink).toHaveBeenCalledWith(PROJECT_ID, { url: "https://example.com" }, ACTOR)
  })

  it("passes optional name / folderId through", async () => {
    asRole("dev")
    vi.mocked(svc.createLink).mockResolvedValue({ id: "lnk1" } as never)
    await route.POST(req("POST", { url: "https://example.com", name: "Repo", folderId: "f1" }), ctx())
    expect(svc.createLink).toHaveBeenCalledWith(PROJECT_ID, { url: "https://example.com", name: "Repo", folderId: "f1" }, ACTOR)
  })

  it("400 for an empty / missing url (schema validation, service never called)", async () => {
    asRole("dev")
    expect((await route.POST(req("POST", { url: "" }), ctx())).status).toBe(400)
    expect((await route.POST(req("POST", {}), ctx())).status).toBe(400)
    expect(svc.createLink).not.toHaveBeenCalled()
  })

  it("surfaces LINK_URL_INVALID from the service as 400", async () => {
    asRole("dev")
    vi.mocked(svc.createLink).mockRejectedValue(new ValidationError("bad url", {}, "LINK_URL_INVALID"))
    expect(await read(await route.POST(req("POST", { url: "https://example.com" }), ctx()))).toEqual({
      status: 400,
      body: { error: "bad url", code: "LINK_URL_INVALID" },
    })
  })

  it("surfaces FOLDER_NOT_FOUND from the service as 404", async () => {
    asRole("dev")
    vi.mocked(svc.createLink).mockRejectedValue(new NotFoundError("no folder", {}, "FOLDER_NOT_FOUND"))
    expect((await route.POST(req("POST", { url: "https://example.com", folderId: "fx" }), ctx())).status).toBe(404)
  })

  it("maps unknown errors to 500", async () => {
    asRole("dev")
    vi.mocked(svc.createLink).mockRejectedValue(new Error("boom"))
    expect(await read(await route.POST(req("POST", { url: "https://example.com" }), ctx()))).toEqual({
      status: 500,
      body: { error: "リンクの追加に失敗しました", code: "INTERNAL" },
    })
  })

  it("401 without a session", async () => {
    const { signedOut } = await import("./route-harness")
    signedOut()
    expect((await route.POST(req("POST", { url: "https://example.com" }), ctx())).status).toBe(401)
    expect(svc.createLink).not.toHaveBeenCalled()
  })

  it("404 for a non-member", async () => {
    asRole(null)
    expect((await route.POST(req("POST", { url: "https://example.com" }), ctx())).status).toBe(404)
    expect(svc.createLink).not.toHaveBeenCalled()
  })
})

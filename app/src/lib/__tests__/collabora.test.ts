import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules()
  for (const k of ["COLLABORA_INTERNAL_URL", "NEXT_PUBLIC_COLLABORA_URL", "APP_EXTERNAL_URL"]) {
    vi.stubEnv(k, env[k] as string)
  }
  return import("@/lib/collabora")
}

const XML = `<wopi-discovery><net-zone>
  <app name="calc"><action default="true" ext="xlsx" name="edit" urlsrc="https://internal:9980/browser/abc/cool.html?"/></app>
  <app name="writer"><action name="edit" ext="docx" urlsrc="http://internal:9980/browser/writer.html?"/></app>
</net-zone></wopi-discovery>`

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => XML })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("isEditableInCollabora", () => {
  it("accepts office types and rejects others", async () => {
    const { isEditableInCollabora } = await load()
    for (const t of [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]) {
      expect(isEditableInCollabora(t)).toBe(true)
    }
    expect(isEditableInCollabora("image/png")).toBe(false)
    expect(isEditableInCollabora("application/pdf")).toBe(false)
  })
})

describe("getCollaboraEditorUrl", () => {
  it("uses the ext/name/urlsrc order and rewrites the origin to the public URL", async () => {
    const { getCollaboraEditorUrl } = await load({
      COLLABORA_INTERNAL_URL: "http://collabora:9980",
      NEXT_PUBLIC_COLLABORA_URL: "http://office.example:9980",
      APP_EXTERNAL_URL: "http://app.example",
    })
    const out = await getCollaboraEditorUrl(
      "p1",
      "a1",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    expect(fetchMock).toHaveBeenCalledWith("http://collabora:9980/hosting/discovery")
    expect(out.wopiSrc).toBe("http://app.example/api/wopi/files/p1_a1")
    expect(out.editorUrl).toBe(
      `http://office.example:9980/browser/abc/cool.html?WOPISrc=${encodeURIComponent(out.wopiSrc)}&lang=ja`
    )
  })

  it("matches the name-before-ext attribute order", async () => {
    const { getCollaboraEditorUrl } = await load()
    const out = await getCollaboraEditorUrl(
      "p1",
      "a1",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    expect(out.editorUrl.startsWith("http://localhost:9980/browser/writer.html?WOPISrc=")).toBe(true)
    expect(out.wopiSrc).toBe("http://host.docker.internal:3000/api/wopi/files/p1_a1")
  })

  it("falls back to any edit action for an unknown extension", async () => {
    const { getCollaboraEditorUrl } = await load()
    const out = await getCollaboraEditorUrl("p1", "a1", "application/vnd.ms-powerpoint")
    expect(out.editorUrl).toContain("/browser/abc/cool.html?")
  })

  it("throws when discovery fails", async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const { getCollaboraEditorUrl } = await load()
    await expect(getCollaboraEditorUrl("p1", "a1", "application/msword")).rejects.toThrow(/discovery/)
  })

  it("throws when no edit action exists", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "<wopi-discovery/>" })
    const { getCollaboraEditorUrl } = await load()
    await expect(getCollaboraEditorUrl("p1", "a1", "application/msword")).rejects.toThrow(/doc/)
  })
})

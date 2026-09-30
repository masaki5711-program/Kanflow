import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

const { isAllowedMime, isInlineSafeMime, resolveServeHeaders, safeEqual } = await import(
  "@/lib/api-helpers"
)

describe("isInlineSafeMime", () => {
  it.each([
    "image/png",
    "image/jpeg",
    "video/mp4",
    "audio/mpeg",
    "application/pdf",
    "text/plain",
    "text/plain; charset=utf-8",
    "IMAGE/PNG",
  ])("allows %s inline", (mime) => {
    expect(isInlineSafeMime(mime)).toBe(true)
  })

  it.each([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
    "text/javascript",
    "application/json",
    "text/csv",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "",
  ])("forbids %s inline", (mime) => {
    expect(isInlineSafeMime(mime)).toBe(false)
  })
})

describe("resolveServeHeaders", () => {
  it("serves whitelisted types inline unless download is forced", () => {
    expect(resolveServeHeaders("image/png", false)).toEqual({
      contentType: "image/png",
      disposition: "inline",
    })
    expect(resolveServeHeaders("image/png", true)).toEqual({
      contentType: "image/png",
      disposition: "attachment",
    })
  })

  it("forces download for other types but keeps their content type", () => {
    expect(resolveServeHeaders("application/zip", false)).toEqual({
      contentType: "application/zip",
      disposition: "attachment",
    })
  })

  it.each(["text/html", "image/svg+xml", "application/xml", "text/xml", "application/javascript"])(
    "downgrades active content %s to an octet-stream download",
    (mime) => {
      expect(resolveServeHeaders(mime, false)).toEqual({
        contentType: "application/octet-stream",
        disposition: "attachment",
      })
    }
  )
})

describe("safeEqual", () => {
  it("matches only identical non-empty strings", () => {
    expect(safeEqual("secret", "secret")).toBe(true)
    expect(safeEqual("secret", "secreT")).toBe(false)
    expect(safeEqual("secret", "secret2")).toBe(false)
    expect(safeEqual(null, "secret")).toBe(false)
    expect(safeEqual("", "")).toBe(false)
  })
})

describe("isAllowedMime", () => {
  it("normalizes parameters and case", () => {
    expect(isAllowedMime("Text/Plain; charset=utf-8")).toBe(true)
    expect(isAllowedMime("application/x-msdownload")).toBe(false)
  })
})

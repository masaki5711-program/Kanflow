import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { throttle } from "@/lib/throttle"
import { compressImageFile } from "@/lib/image-compress"

describe("throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
  })
  afterEach(() => vi.useRealTimers())

  it("fires on the leading edge and suppresses calls within the window", () => {
    const fn = vi.fn()
    const t = throttle(1000, fn)
    t("a")
    t("b")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("a")
    vi.advanceTimersByTime(999)
    t("c")
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    t("d")
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith("d")
  })
})

describe("compressImageFile", () => {
  let blobOut: Blob | null
  let ctx: Record<string, unknown> | null
  let canvas: { width: number; height: number; getContext: () => unknown; toBlob: ReturnType<typeof vi.fn> }
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    blobOut = new Blob(["x"])
    ctx = { drawImage: vi.fn() }
    bitmap = { width: 4000, height: 2000, close: vi.fn() }
    canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blobOut)),
    }
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap))
    vi.stubGlobal("document", { createElement: () => canvas })
  })
  afterEach(() => vi.unstubAllGlobals())

  const big = (type: string, name = "photo.jpeg") => new File(["y".repeat(1000)], name, { type })

  it.each(["application/pdf", "image/gif", "image/svg+xml"])("returns %s unchanged", async (type) => {
    const f = big(type)
    expect(await compressImageFile(f)).toBe(f)
  })

  it("resizes a large JPEG to maxEdge and renames to .jpg", async () => {
    const f = big("image/jpeg")
    const out = await compressImageFile(f, { maxEdge: 1000, quality: 0.5 })
    expect(out).not.toBe(f)
    expect(out.name).toBe("photo.jpg")
    expect(out.type).toBe("image/jpeg")
    expect(canvas.width).toBe(1000)
    expect(canvas.height).toBe(500)
    expect(canvas.toBlob.mock.calls[0][1]).toBe("image/jpeg")
    expect(canvas.toBlob.mock.calls[0][2]).toBe(0.5)
    expect(bitmap.close).toHaveBeenCalled()
    expect(ctx?.imageSmoothingQuality).toBe("high")
  })

  it("keeps PNG as PNG without a quality argument and does not upscale", async () => {
    bitmap.width = 100
    bitmap.height = 50
    const out = await compressImageFile(big("image/png", "noext"))
    expect(out.name).toBe("noext.png")
    expect(out.type).toBe("image/png")
    expect(canvas.width).toBe(100)
    expect(canvas.toBlob.mock.calls[0][2]).toBeUndefined()
  })

  it("returns the original when the result is not smaller", async () => {
    blobOut = new Blob(["z".repeat(5000)])
    const f = big("image/jpeg")
    expect(await compressImageFile(f)).toBe(f)
  })

  it("returns the original when there is no 2d context", async () => {
    ctx = null
    const f = big("image/jpeg")
    expect(await compressImageFile(f)).toBe(f)
  })

  it("returns the original when toBlob yields null", async () => {
    blobOut = null
    const f = big("image/webp")
    expect(await compressImageFile(f)).toBe(f)
  })

  it("returns the original when decoding fails", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad image") }))
    const f = big("image/jpeg")
    expect(await compressImageFile(f)).toBe(f)
  })
})

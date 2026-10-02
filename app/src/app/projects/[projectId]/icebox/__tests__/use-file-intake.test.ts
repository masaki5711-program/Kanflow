import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonResponse, stubFetch } from "@/app/__tests__/test-utils"

const compress = vi.hoisted(() => vi.fn(async (f: File) => f))
vi.mock("@/lib/image-compress", () => ({ compressImageFile: compress }))

const { uploadIceboxFiles } = await import("../use-file-intake")

const BASE = "/api/projects/p1/icebox/i1/attachments"
const att = (id: string, name: string) => ({ id, fileName: name, originalName: name, fileSize: 1, mimeType: "text/plain" })

describe("uploadIceboxFiles", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    compress.mockClear()
  })

  it("uploads files one by one in order, compressing images first", async () => {
    const seen: string[] = []
    stubFetch([{ match: BASE, method: "POST", respond: async (_u, init) => {
      const name = ((init!.body as FormData).get("file") as File).name
      seen.push(name)
      return jsonResponse(att(name, name))
    } }])
    const img = new File(["x"], "pic.png", { type: "image/png" })
    const doc = new File(["y"], "notes.txt", { type: "text/plain" })
    const { saved, failed } = await uploadIceboxFiles("p1", "i1", [img, doc])
    expect(seen).toEqual(["pic.png", "notes.txt"])
    expect(saved.map((a) => a.id)).toEqual(["pic.png", "notes.txt"])
    expect(failed).toEqual([])
    expect(compress).toHaveBeenCalledTimes(1)
    expect(compress).toHaveBeenCalledWith(img)
  })

  it("collects per-file failures without aborting the rest of the batch", async () => {
    let call = 0
    stubFetch([{ match: BASE, method: "POST", respond: async (_u, init) => {
      call += 1
      const name = ((init!.body as FormData).get("file") as File).name
      if (call === 2) return jsonResponse({ error: "too big" }, 413)
      return jsonResponse(att(String(call), name))
    } }])
    const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt"), new File(["c"], "c.txt")]
    const { saved, failed } = await uploadIceboxFiles("p1", "i1", files)
    expect(saved.map((a) => a.originalName)).toEqual(["a.txt", "c.txt"])
    expect(failed).toEqual([{ name: "b.txt", message: "too big" }])
  })

  it("returns empty results for an empty file list", async () => {
    stubFetch([])
    const { saved, failed } = await uploadIceboxFiles("p1", "i1", [])
    expect(saved).toEqual([])
    expect(failed).toEqual([])
  })
})

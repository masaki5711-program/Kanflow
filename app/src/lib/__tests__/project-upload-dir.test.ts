import path from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("fs/promises", () => {
  const rm = vi.fn(async () => undefined)
  return { default: { rm }, rm }
})

const fs = (await import("fs/promises")).default
const { projectUploadDir, removeProjectUploadDir, uploadsRoot } = await import("@/lib/api-helpers")

const ROOT = path.join(process.cwd(), "private", "uploads")

describe("projectUploadDir", () => {
  it("maps a plain id to a direct child of the uploads root", () => {
    expect(uploadsRoot()).toBe(ROOT)
    expect(projectUploadDir("cmabc123")).toBe(path.join(ROOT, "cmabc123"))
  })

  it.each(["", ".", "..", "../x", "a/b", "a\b", "../../etc", path.resolve("/tmp/evil")])(
    "rejects unsafe id %j",
    (id) => {
      expect(projectUploadDir(id)).toBeNull()
    },
  )
})

describe("removeProjectUploadDir", () => {
  beforeEach(() => vi.clearAllMocks())

  it("recursively removes the resolved project directory", async () => {
    await expect(removeProjectUploadDir("p1")).resolves.toBe(true)
    expect(fs.rm).toHaveBeenCalledWith(path.join(ROOT, "p1"), { recursive: true, force: true })
  })

  it("never touches the filesystem for an unsafe id", async () => {
    await expect(removeProjectUploadDir("..")).resolves.toBe(false)
    await expect(removeProjectUploadDir("")).resolves.toBe(false)
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it("propagates fs errors to the caller", async () => {
    vi.mocked(fs.rm).mockRejectedValueOnce(new Error("EPERM"))
    await expect(removeProjectUploadDir("p1")).rejects.toThrow("EPERM")
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const userFindUnique = vi.fn()
const memberFindFirst = vi.fn()
const attachmentFindFirst = vi.fn()
const attachmentUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    projectMember: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
    projectAttachment: {
      findFirst: (...a: unknown[]) => attachmentFindFirst(...a),
      update: (...a: unknown[]) => attachmentUpdate(...a),
    },
  },
}))

const fsStat = vi.fn()
const fsReadFile = vi.fn()
const fsWriteFile = vi.fn()
vi.mock("fs/promises", () => {
  const api = {
    stat: (...a: unknown[]) => fsStat(...a),
    readFile: (...a: unknown[]) => fsReadFile(...a),
    writeFile: (...a: unknown[]) => fsWriteFile(...a),
    rm: vi.fn(),
    mkdir: vi.fn(),
  }
  return { default: api, ...api }
})

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

process.env.WOPI_ACCESS_TOKEN = "test-wopi-secret"

const { signWopiToken, getWopiSigningKey, buildWopiFileId } = await import("@/lib/wopi-token")
const infoMod = await import("../files/[fileId]/route")
const contentsMod = await import("../files/[fileId]/contents/route")

type Ctx = { params: Promise<{ fileId: string }> }
/** Route handlers are typed `Promise<NextResponse | undefined>`; narrow once here. */
function strict(fn: (r: Request, c: Ctx) => Promise<Response | undefined>) {
  return async (r: Request, c: Ctx): Promise<Response> => {
    const res = await fn(r, c)
    if (!res) throw new Error("no response")
    return res
  }
}
const infoRoute = { GET: strict(infoMod.GET) }
const contentsRoute = { GET: strict(contentsMod.GET), POST: strict(contentsMod.POST) }
const { MAX_UPLOAD_SIZE } = await import("@/lib/api-helpers")

const PROJECT = "proj1"
const ATT = "att1"
const FILE_ID = buildWopiFileId(PROJECT, ATT)

interface TokenOpts {
  canWrite?: boolean
  attachmentId?: string
  projectId?: string
  now?: number
  ttl?: number
}

function token(opts: TokenOpts = {}) {
  const key = getWopiSigningKey()
  if (!key) throw new Error("no key")
  return signWopiToken(
    {
      projectId: opts.projectId ?? PROJECT,
      attachmentId: opts.attachmentId ?? ATT,
      userId: "u1",
      canWrite: opts.canWrite ?? true,
    },
    key,
    opts.now,
    opts.ttl
  ).token
}

function req(fileId: string, tok: string | null, init?: RequestInit) {
  const q = tok === null ? "" : `?access_token=${encodeURIComponent(tok)}`
  return new Request(`http://localhost/api/wopi/files/${fileId}${q}`, init)
}
const ctx = (fileId: string) => ({ params: Promise.resolve({ fileId }) })

const attachment = {
  id: ATT,
  projectId: PROJECT,
  fileName: "abc.docx",
  originalName: "Report.docx",
  fileSize: 10,
  uploadedBy: "u9",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

beforeEach(() => {
  process.env.WOPI_ACCESS_TOKEN = "test-wopi-secret"
  userFindUnique.mockReset().mockResolvedValue({ name: "Alice", isActive: true, role: "member" })
  memberFindFirst.mockReset().mockResolvedValue({ id: "m1" })
  attachmentFindFirst.mockReset().mockResolvedValue(attachment)
  attachmentUpdate.mockReset().mockResolvedValue({})
  fsStat.mockReset().mockResolvedValue({ size: 42 })
  fsReadFile.mockReset().mockResolvedValue(Buffer.from("hello"))
  fsWriteFile.mockReset().mockResolvedValue(undefined)
})

type Handler = (r: Request, c: { params: Promise<{ fileId: string }> }) => Promise<Response>
const handlers: Array<[string, string, () => Handler]> = [
  ["CheckFileInfo", "GET", () => infoRoute.GET],
  ["GetFile", "GET", () => contentsRoute.GET],
  ["PutFile", "POST", () => contentsRoute.POST],
]

describe("WOPI token scope enforcement (all endpoints)", () => {
  for (const [name, method, h] of handlers) {
    it(`${name}: missing token -> 401`, async () => {
      const res = await h()(req(FILE_ID, null, { method }), ctx(FILE_ID))
      expect(res.status).toBe(401)
      expect(attachmentFindFirst).not.toHaveBeenCalled()
    })

    it(`${name}: token issued for another fileId -> 401`, async () => {
      const other = buildWopiFileId(PROJECT, "att2")
      const res = await h()(req(other, token(), { method }), ctx(other))
      expect(res.status).toBe(401)
      expect(attachmentFindFirst).not.toHaveBeenCalled()
    })

    it(`${name}: token for another project -> 401`, async () => {
      const res = await h()(req(FILE_ID, token({ projectId: "evil" }), { method }), ctx(FILE_ID))
      expect(res.status).toBe(401)
    })

    it(`${name}: expired token -> 401`, async () => {
      const t = token({ now: Date.now() - 2 * 3600_000, ttl: 3600_000 })
      const res = await h()(req(FILE_ID, t, { method }), ctx(FILE_ID))
      expect(res.status).toBe(401)
    })

    it(`${name}: tampered payload -> 401`, async () => {
      const parts = token().split(".")
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
      payload.attachmentId = "att2"
      const forged = [parts[0], Buffer.from(JSON.stringify(payload)).toString("base64url"), parts[2]].join(".")
      const other = buildWopiFileId(PROJECT, "att2")
      const res = await h()(req(other, forged, { method }), ctx(other))
      expect(res.status).toBe(401)
    })

    it(`${name}: garbage token -> 401`, async () => {
      const res = await h()(req(FILE_ID, "not-a-jwt", { method }), ctx(FILE_ID))
      expect(res.status).toBe(401)
    })

    it(`${name}: token signed with a different secret -> 401`, async () => {
      const t = token()
      process.env.WOPI_ACCESS_TOKEN = "rotated-secret"
      const res = await h()(req(FILE_ID, t, { method }), ctx(FILE_ID))
      expect(res.status).toBe(401)
    })

    it(`${name}: no signing secret configured -> 401`, async () => {
      const t = token()
      const saved = { a: process.env.AUTH_SECRET, n: process.env.NEXTAUTH_SECRET }
      delete process.env.WOPI_ACCESS_TOKEN
      delete process.env.AUTH_SECRET
      delete process.env.NEXTAUTH_SECRET
      try {
        const res = await h()(req(FILE_ID, t, { method }), ctx(FILE_ID))
        expect(res.status).toBe(401)
      } finally {
        if (saved.a !== undefined) process.env.AUTH_SECRET = saved.a
        if (saved.n !== undefined) process.env.NEXTAUTH_SECRET = saved.n
      }
    })

    it(`${name}: user removed from project -> 403`, async () => {
      memberFindFirst.mockResolvedValue(null)
      const res = await h()(req(FILE_ID, token(), { method }), ctx(FILE_ID))
      expect(res.status).toBe(403)
      expect(attachmentFindFirst).not.toHaveBeenCalled()
    })

    it(`${name}: disabled user -> 403`, async () => {
      userFindUnique.mockResolvedValue({ name: "A", isActive: false, role: "admin" })
      const res = await h()(req(FILE_ID, token(), { method }), ctx(FILE_ID))
      expect(res.status).toBe(403)
    })

    it(`${name}: unknown user -> 403`, async () => {
      userFindUnique.mockResolvedValue(null)
      const res = await h()(req(FILE_ID, token(), { method }), ctx(FILE_ID))
      expect(res.status).toBe(403)
    })
  }

  it("re-checks membership and loads the attachment scoped to the token's project", async () => {
    await infoRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { projectId: PROJECT, userId: "u1" },
      select: { id: true },
    })
    expect(attachmentFindFirst).toHaveBeenCalledWith({ where: { id: ATT, projectId: PROJECT } })
  })

  it("system admin passes without membership lookup", async () => {
    userFindUnique.mockResolvedValue({ name: "Root", isActive: true, role: "admin" })
    const res = await infoRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(200)
    expect(memberFindFirst).not.toHaveBeenCalled()
  })
})

describe("CheckFileInfo", () => {
  it("returns file info with write flags from the token", async () => {
    const res = await infoRoute.GET(req(FILE_ID, token({ canWrite: true })), ctx(FILE_ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      BaseFileName: "Report.docx",
      Size: 42,
      OwnerId: "u9",
      UserId: "u1",
      UserFriendlyName: "Alice",
      UserCanWrite: true,
      ReadOnly: false,
      SupportsUpdate: true,
      SupportsLocks: false,
      Version: "2026-01-01T00:00:00.000Z",
    })
  })

  it("read-only token yields ReadOnly and default owner", async () => {
    attachmentFindFirst.mockResolvedValue({ ...attachment, uploadedBy: null })
    const res = await infoRoute.GET(req(FILE_ID, token({ canWrite: false })), ctx(FILE_ID))
    const body = await res.json()
    expect(body.ReadOnly).toBe(true)
    expect(body.UserCanWrite).toBe(false)
    expect(body.SupportsUpdate).toBe(false)
    expect(body.OwnerId).toBe("kanflow")
  })

  it("404 when attachment row missing", async () => {
    attachmentFindFirst.mockResolvedValue(null)
    const res = await infoRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(404)
  })

  it("400 when stored fileName escapes the uploads dir", async () => {
    attachmentFindFirst.mockResolvedValue({ ...attachment, fileName: "../../../etc/passwd" })
    const res = await infoRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(400)
    expect(fsStat).not.toHaveBeenCalled()
  })

  it("404 when file missing on disk", async () => {
    fsStat.mockRejectedValue(new Error("ENOENT"))
    const res = await infoRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(404)
  })
})

describe("GetFile", () => {
  it("returns bytes as octet-stream with nosniff (read-only token allowed)", async () => {
    const res = await contentsRoute.GET(req(FILE_ID, token({ canWrite: false })), ctx(FILE_ID))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/octet-stream")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("hello")
  })

  it("404 when row missing", async () => {
    attachmentFindFirst.mockResolvedValue(null)
    const res = await contentsRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(404)
  })

  it("400 on unsafe path", async () => {
    attachmentFindFirst.mockResolvedValue({ ...attachment, fileName: "../../x" })
    const res = await contentsRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(400)
    expect(fsReadFile).not.toHaveBeenCalled()
  })

  it("404 when read fails", async () => {
    fsReadFile.mockRejectedValue(new Error("ENOENT"))
    const res = await contentsRoute.GET(req(FILE_ID, token()), ctx(FILE_ID))
    expect(res.status).toBe(404)
  })
})

describe("PutFile", () => {
  it("read-only token -> 403 and nothing written", async () => {
    const res = await contentsRoute.POST(
      req(FILE_ID, token({ canWrite: false }), { method: "POST", body: "new" }),
      ctx(FILE_ID)
    )
    expect(res.status).toBe(403)
    expect(fsWriteFile).not.toHaveBeenCalled()
    expect(attachmentUpdate).not.toHaveBeenCalled()
  })

  it("declared oversize content-length -> 413", async () => {
    const res = await contentsRoute.POST(
      req(FILE_ID, token(), {
        method: "POST",
        body: "x",
        headers: { "content-length": String(MAX_UPLOAD_SIZE + 1) },
      }),
      ctx(FILE_ID)
    )
    expect(res.status).toBe(413)
    expect(fsWriteFile).not.toHaveBeenCalled()
  })

  it("streamed body exceeding the limit without content-length -> 413", async () => {
    const chunk = new Uint8Array(64 * 1024 * 1024)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent > MAX_UPLOAD_SIZE) {
          c.close()
          return
        }
        sent += chunk.byteLength
        c.enqueue(chunk)
      },
    })
    const res = await contentsRoute.POST(
      req(FILE_ID, token(), { method: "POST", body: stream, duplex: "half" } as RequestInit),
      ctx(FILE_ID)
    )
    expect(res.status).toBe(413)
    expect(fsWriteFile).not.toHaveBeenCalled()
  })

  it("writes body and updates size scoped to the attachment", async () => {
    const res = await contentsRoute.POST(
      req(FILE_ID, token(), { method: "POST", body: "new-bytes" }),
      ctx(FILE_ID)
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    const [p, buf] = fsWriteFile.mock.calls[0]
    expect(String(p)).toMatch(/private[\\/]uploads[\\/]proj1[\\/]abc\.docx$/)
    expect(Buffer.from(buf).toString()).toBe("new-bytes")
    expect(attachmentUpdate).toHaveBeenCalledWith({
      where: { id: ATT },
      data: { fileSize: 9, updatedAt: expect.any(Date) },
    })
  })

  it("empty body writes zero bytes", async () => {
    const res = await contentsRoute.POST(req(FILE_ID, token(), { method: "POST" }), ctx(FILE_ID))
    expect(res.status).toBe(200)
    expect(Buffer.from(fsWriteFile.mock.calls[0][1]).length).toBe(0)
  })

  it("404 when row missing", async () => {
    attachmentFindFirst.mockResolvedValue(null)
    const res = await contentsRoute.POST(req(FILE_ID, token(), { method: "POST", body: "a" }), ctx(FILE_ID))
    expect(res.status).toBe(404)
  })

  it("400 on unsafe path", async () => {
    attachmentFindFirst.mockResolvedValue({ ...attachment, fileName: "../../x" })
    const res = await contentsRoute.POST(req(FILE_ID, token(), { method: "POST", body: "a" }), ctx(FILE_ID))
    expect(res.status).toBe(400)
    expect(fsWriteFile).not.toHaveBeenCalled()
  })

  it("500 when write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    fsWriteFile.mockRejectedValue(new Error("disk full"))
    const res = await contentsRoute.POST(req(FILE_ID, token(), { method: "POST", body: "a" }), ctx(FILE_ID))
    expect(res.status).toBe(500)
    spy.mockRestore()
  })
})

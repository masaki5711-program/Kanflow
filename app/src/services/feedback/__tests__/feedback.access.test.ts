import { describe, expect, it, vi } from "vitest"
import { canCurateScope, canSeeScope, curatesAnything, loadViewerAccess, parseScope, projectScope, type ViewerAccess } from "../feedback.access"

const db = (rows: Array<{ projectId: string; role: string }>) => ({ projectMember: { findMany: vi.fn(async () => rows) } }) as never

const access = (over: Partial<ViewerAccess> = {}): ViewerAccess => ({
  userId: "u1",
  admin: false,
  curatesGlobal: false,
  memberProjects: new Set(),
  curatorProjects: new Set(),
  ...over,
})

describe("scopes", () => {
  it("parseScope / projectScope", () => {
    expect(parseScope("global")).toEqual({ kind: "global" })
    expect(parseScope("tech:rust")).toEqual({ kind: "tech", name: "rust" })
    expect(parseScope("project:abc")).toEqual({ kind: "project", id: "abc" })
    expect(projectScope("ABC")).toBe("project:abc")
  })

  it("everyone sees global and tech scopes; project scopes only members (admin all)", () => {
    const a = access({ memberProjects: new Set(["p1"]) })
    expect(canSeeScope(a, "global")).toBe(true)
    expect(canSeeScope(a, "tech:rust")).toBe(true)
    expect(canSeeScope(a, "project:p1")).toBe(true)
    expect(canSeeScope(a, "project:p2")).toBe(false)
    expect(canSeeScope(access({ admin: true }), "project:p2")).toBe(true)
  })

  it("curating: admin everything; section manager global / tech; PO / SM their project only; a plain member nothing", () => {
    expect(canCurateScope(access({ admin: true }), "project:p9")).toBe(true)
    const sm = access({ curatesGlobal: true })
    expect(canCurateScope(sm, "global")).toBe(true)
    expect(canCurateScope(sm, "tech:rust")).toBe(true)
    expect(canCurateScope(sm, "project:p1")).toBe(false)
    const po = access({ memberProjects: new Set(["p1"]), curatorProjects: new Set(["p1"]) })
    expect(canCurateScope(po, "project:p1")).toBe(true)
    expect(canCurateScope(po, "project:p2")).toBe(false)
    expect(canCurateScope(po, "global")).toBe(false)
    const dev = access({ memberProjects: new Set(["p1"]) })
    expect(["global", "tech:x", "project:p1"].some((s) => canCurateScope(dev, s))).toBe(false)
    expect(curatesAnything(dev)).toBe(false)
    expect(curatesAnything(po)).toBe(true)
  })
})

describe("loadViewerAccess", () => {
  it("admin: no membership lookup", async () => {
    const d = db([])
    const a = await loadViewerAccess(d, { userId: "u1", systemRole: "admin" })
    expect(a).toMatchObject({ admin: true, curatesGlobal: true })
    expect((d as unknown as { projectMember: { findMany: ReturnType<typeof vi.fn> } }).projectMember.findMany).not.toHaveBeenCalled()
  })

  it("member / PO / SM from the project roles", async () => {
    const a = await loadViewerAccess(db([{ projectId: "P1", role: "po" }, { projectId: "p2", role: "dev" }, { projectId: "p3", role: "sm" }]), { userId: "u1", systemRole: "member" })
    expect([...a.memberProjects].sort()).toEqual(["p1", "p2", "p3"])
    expect([...a.curatorProjects].sort()).toEqual(["p1", "p3"])
    expect(a.curatesGlobal).toBe(false)
  })

  it("a section manager curates global lessons", async () => {
    expect((await loadViewerAccess(db([]), { userId: "u1", systemRole: "section_manager" })).curatesGlobal).toBe(true)
  })

  it("a token limited to some projects sees and curates only inside them, and is never global", async () => {
    const a = await loadViewerAccess(db([{ projectId: "p1", role: "po" }, { projectId: "p2", role: "po" }]), { userId: "u1", systemRole: "section_manager", projectIds: ["p1"] })
    expect([...a.memberProjects]).toEqual(["p1"])
    expect([...a.curatorProjects]).toEqual(["p1"])
    expect(a.curatesGlobal).toBe(false)
    const admin = await loadViewerAccess(db([]), { userId: "u1", systemRole: "admin", projectIds: ["p1"] })
    expect(admin).toMatchObject({ admin: false, curatesGlobal: false })
    expect([...admin.curatorProjects]).toEqual(["p1"])
  })
})

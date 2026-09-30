import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/chat-threads/chat-proposal-outcomes.service", () => ({ updateProposalOutcome: vi.fn() }))

const svc = await import("@/services/chat-threads/chat-proposal-outcomes.service")
const route = await import("@/app/api/projects/[projectId]/chat/threads/[threadId]/proposals/[proposalId]/route")
const { ConflictError, NotFoundError } = await import("@/services/_shared")

const OWNER = { projectId: PROJECT_ID, userId: "u1" }
const pCtx = (proposalId = "prop_abc") => ctx({ threadId: "t1", proposalId })
const APPLIED = { status: "applied", appliedEntityId: "pbi1", at: "2026-10-01T00:00:00.000Z", by: "u1" }

beforeEach(() => {
  vi.mocked(svc.updateProposalOutcome).mockReset()
  vi.mocked(svc.updateProposalOutcome).mockResolvedValue(APPLIED as never)
})

describe("POST /chat/threads/[threadId]/proposals/[proposalId]", () => {
  it("records the transition for the caller's thread", async () => {
    asRole("dev")
    const res = await route.POST(req("POST", { action: "confirm", appliedEntityId: "pbi1" }), pCtx())
    expect(await read(res)).toEqual({ status: 200, body: { outcome: APPLIED } })
    expect(svc.updateProposalOutcome).toHaveBeenCalledWith(OWNER, "t1", "prop_abc", { action: "confirm", appliedEntityId: "pbi1" })
  })

  it("409 with the stored outcome when the proposal was already applied", async () => {
    asRole("dev")
    vi.mocked(svc.updateProposalOutcome).mockRejectedValue(new ConflictError("Proposal already handled", { outcome: APPLIED }))
    const { status, body } = await read(await route.POST(req("POST", { action: "reserve" }), pCtx()))
    expect(status).toBe(409)
    expect(body).toMatchObject({ code: "CONFLICT", outcome: APPLIED })
  })

  it("404 when the thread / proposal is not found", async () => {
    asRole("dev")
    vi.mocked(svc.updateProposalOutcome).mockRejectedValue(new NotFoundError("Proposal not found in this thread"))
    expect((await route.POST(req("POST", { action: "reject" }), pCtx())).status).toBe(404)
  })

  it("400 for an unknown action or a malformed proposal id; 401 signed out", async () => {
    asRole("dev")
    expect((await route.POST(req("POST", { action: "delete" }), pCtx())).status).toBe(400)
    expect((await route.POST(req("POST", { action: "reserve" }), pCtx("bad id!"))).status).toBe(400)
    expect(svc.updateProposalOutcome).not.toHaveBeenCalled()
    signedOut()
    expect((await route.POST(req("POST", { action: "reserve" }), pCtx())).status).toBe(401)
  })
})

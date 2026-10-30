import { describe, expect, it } from "vitest"
import {
  canTakeOver,
  claimConflicts,
  overlappingClaims,
  toHolderDto,
  claimStaleHours,
  DEFAULT_CLAIM_STALE_HOURS,
  isClaimActive,
  staleBefore,
  toClaimDto,
  type ClaimRow,
} from "../dev-work.rules"

const NOW = new Date("2026-10-30T12:00:00.000Z")
const HOUR = 3_600_000

function claim(over: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: "c1",
    projectId: "p1",
    backlogItemId: "b1",
    taskId: null,
    userId: "u1",
    sessionId: "s-1",
    branch: "feat/L3-PBI-12-x",
    heartbeatAt: new Date(NOW.getTime() - HOUR),
    releasedAt: null,
    createdAt: new Date(NOW.getTime() - 2 * HOUR),
    backlogItem: { id: "b1", displayId: 12, initiative: "Login", userStory: null },
    task: null,
    user: { id: "u1", name: "Dev One" },
    ...over,
  }
}

describe("claimStaleHours (DEV_CLAIM_STALE_HOURS)", () => {
  it("defaults to 4 hours and accepts 1-168", () => {
    expect(DEFAULT_CLAIM_STALE_HOURS).toBe(4)
    expect(claimStaleHours({})).toBe(4)
    expect(claimStaleHours({ DEV_CLAIM_STALE_HOURS: "8" })).toBe(8)
    expect(claimStaleHours({ DEV_CLAIM_STALE_HOURS: "168" })).toBe(168)
  })

  it.each(["0", "-1", "169", "2.5", "abc", ""])("falls back to the default for %j", (raw) => {
    expect(claimStaleHours({ DEV_CLAIM_STALE_HOURS: raw })).toBe(DEFAULT_CLAIM_STALE_HOURS)
  })
})

describe("expiry", () => {
  it("a claim is active until released or stale (no heartbeat for the window)", () => {
    expect(isClaimActive(claim(), NOW, 4)).toBe(true)
    expect(isClaimActive(claim({ heartbeatAt: new Date(NOW.getTime() - 4 * HOUR) }), NOW, 4)).toBe(true)
    expect(isClaimActive(claim({ heartbeatAt: new Date(NOW.getTime() - 4 * HOUR - 1) }), NOW, 4)).toBe(false)
    expect(isClaimActive(claim({ releasedAt: NOW }), NOW, 4)).toBe(false)
    expect(staleBefore(NOW, 4)).toEqual(new Date(NOW.getTime() - 4 * HOUR))
  })
})

describe("claimConflicts", () => {
  const mine = claim({ id: "mine", taskId: "k1" })

  it("warns about another user or another session on the same task", () => {
    const otherUser = claim({ id: "a", taskId: "k1", userId: "u2", sessionId: "x" })
    const mySecondSession = claim({ id: "b", taskId: "k1", sessionId: "s-2" })
    expect(claimConflicts(mine, [otherUser, mySecondSession], NOW, 4).map((c) => c.id)).toEqual(["a", "b"])
  })

  it("a whole-PBI claim overlaps every task of the PBI, and the other way round", () => {
    const pbiLevel = claim({ id: "pbi", userId: "u2", taskId: null })
    expect(claimConflicts(mine, [pbiLevel], NOW, 4).map((c) => c.id)).toEqual(["pbi"])
    const otherTask = claim({ id: "t2", userId: "u2", taskId: "k2" })
    expect(claimConflicts(claim({ id: "whole", taskId: null }), [otherTask], NOW, 4).map((c) => c.id)).toEqual(["t2"])
  })

  it("does not warn about other tasks of the PBI, itself, other PBIs, released or stale claims", () => {
    const others = [
      claim({ id: "mine" }),
      claim({ id: "t2", userId: "u2", taskId: "k2" }),
      claim({ id: "otherPbi", userId: "u2", backlogItemId: "b2", taskId: "k1" }),
      claim({ id: "released", userId: "u2", taskId: "k1", releasedAt: NOW }),
      claim({ id: "stale", userId: "u2", taskId: "k1", heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) }),
    ]
    expect(claimConflicts(mine, others, NOW, 4)).toEqual([])
  })

  it("the same user and session on the same target is the claim itself, not a conflict", () => {
    expect(claimConflicts(mine, [claim({ id: "dup", taskId: "k1" })], NOW, 4)).toEqual([])
  })

  it("overlappingClaims also returns stale (not released) claims — what a takeover ends", () => {
    const stale = claim({ id: "stale", userId: "u2", taskId: "k1", heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) })
    const released = claim({ id: "rel", userId: "u2", taskId: "k1", releasedAt: NOW })
    expect(overlappingClaims(mine, [stale, released]).map((c) => c.id)).toEqual(["stale"])
  })

  it("takeover of active blockers only when every blocker is the caller's own session", () => {
    expect(canTakeOver([{ userId: "u1" }, { userId: "u1" }], "u1")).toBe(true)
    expect(canTakeOver([{ userId: "u1" }, { userId: "u2" }], "u1")).toBe(false)
    expect(canTakeOver([], "u1")).toBe(true)
  })
})

describe("toClaimDto", () => {
  it("renders a PBI-level claim with its expiry and active flag", () => {
    expect(toClaimDto(claim(), NOW, 4)).toEqual({
      id: "c1",
      projectId: "p1",
      pbi: { id: "b1", displayId: 12, title: "Login" },
      task: null,
      user: { id: "u1", name: "Dev One" },
      sessionId: "s-1",
      branch: "feat/L3-PBI-12-x",
      startedAt: "2026-10-30T10:00:00.000Z",
      heartbeatAt: "2026-10-30T11:00:00.000Z",
      staleAt: "2026-10-30T15:00:00.000Z",
      releasedAt: null,
      active: true,
      stale: false,
    })
    expect(toClaimDto(claim({ heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) }), NOW, 4)).toMatchObject({ active: false, stale: true })
  })

  it("renders the holder shown in 409 TASK_CLAIMED (name, session, branch, claimed / last heartbeat)", () => {
    expect(toHolderDto(claim({ taskId: "k1", task: { id: "k1", taskName: "API", sprintId: "s1" } }), 4)).toEqual({
      claimId: "c1",
      user: { id: "u1", name: "Dev One" },
      sessionId: "s-1",
      branch: "feat/L3-PBI-12-x",
      pbi: { id: "b1", displayId: 12 },
      task: { id: "k1", name: "API" },
      claimedAt: "2026-10-30T10:00:00.000Z",
      lastHeartbeatAt: "2026-10-30T11:00:00.000Z",
      staleAt: "2026-10-30T15:00:00.000Z",
    })
  })

  it("renders a task claim and a released one", () => {
    const dto = toClaimDto(claim({ taskId: "k1", task: { id: "k1", taskName: "API", sprintId: "s1" }, releasedAt: NOW }), NOW, 4)
    expect(dto.task).toEqual({ id: "k1", name: "API", sprintId: "s1" })
    expect(dto.releasedAt).toBe(NOW.toISOString())
    expect(dto.active).toBe(false)
  })
})

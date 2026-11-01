import { describe, expect, it } from "vitest"
import { claimState, claimsForCard, indexClaims, initials, STALE_SOON_MS, toClaimList, type ScreenClaim } from "../claim-view"

const NOW = new Date("2026-11-01T12:00:00.000Z")
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

function c(over: Partial<ScreenClaim> = {}): ScreenClaim {
  return {
    id: "c1", pbi: { id: "b1", displayId: 1 }, task: null, user: { id: "u1", name: "Dev One" }, ai: true, branch: null,
    startedAt: at(-7_200_000), heartbeatAt: at(-600_000), staleAt: at(3_600_000), stale: false, ...over,
  }
}

describe("claimState", () => {
  it("active with more than 30 minutes left", () => {
    expect(claimState(c({ staleAt: at(STALE_SOON_MS + 1) }), NOW)).toBe("active")
  })
  it("expiring soon with 30 minutes or less left", () => {
    expect(claimState(c({ staleAt: at(STALE_SOON_MS) }), NOW)).toBe("staleSoon")
    expect(claimState(c({ staleAt: at(60_000) }), NOW)).toBe("staleSoon")
  })
  it("stale when the server says so or the time is up (also on a bad date)", () => {
    expect(claimState(c({ stale: true }), NOW)).toBe("stale")
    expect(claimState(c({ staleAt: at(0) }), NOW)).toBe("stale")
    expect(claimState(c({ staleAt: "nope" }), NOW)).toBe("stale")
  })
})

describe("initials", () => {
  it("two words → two initials, one word → first two characters", () => {
    expect(initials("Dev One")).toBe("DO")
    expect(initials("山田太郎")).toBe("山田")
    expect(initials("  ")).toBe("?")
  })
})

describe("indexClaims / claimsForCard", () => {
  it("a card shows its task's claims first, then its PBI's whole-PBI claims; other tasks' claims are not shown", () => {
    const own = c({ id: "a", task: { id: "k1", name: "API" } })
    const other = c({ id: "b", task: { id: "k2", name: "UI" } })
    const whole = c({ id: "w" })
    const otherPbi = c({ id: "x", pbi: { id: "b2", displayId: 2 } })
    const index = indexClaims([whole, own, other, otherPbi])
    expect(claimsForCard(index, "k1", "b1")).toEqual([{ claim: own, wholePbi: false }, { claim: whole, wholePbi: true }])
    expect(claimsForCard(index, "k9", "b9")).toEqual([])
  })
})

describe("toClaimList", () => {
  it("accepts the route's answer; canModerate only when exactly true", () => {
    expect(toClaimList({ data: [], staleAfterHours: 4, canModerate: true })).toEqual({ data: [], staleAfterHours: 4, canModerate: true })
    expect(toClaimList({ data: [], staleAfterHours: 4, canModerate: "yes" }).canModerate).toBe(false)
  })
  it("anything else is an error", () => {
    expect(() => toClaimList({ id: "pbi" })).toThrow()
    expect(() => toClaimList(null)).toThrow()
  })
})

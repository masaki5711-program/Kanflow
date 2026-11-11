import { describe, expect, it } from "vitest"
import { toMyBlockedMrs } from "../my-blocked-mrs"

// Synthetic answers of GET /git/my-blocked-mrs.
const MERGE = { mergeable: false, blockers: [{ reason: "approvals_missing", detail: "required=2 counted=1" }], conflicts: null, checkedAt: "2026-11-11T00:00:00.000Z" }
const ITEM = { linkId: "l1", iid: "22", title: "synthetic", url: "https://gitstation.example.test/x", repository: "app", pbiId: "b1", pbiKey: "PBI-1", pbiDisplayId: 1, mine: "branch", branch: "feature/PBI-1", merge: MERGE }

describe("N10 自分の MR で止まっているもの — the answer as read by the dashboard", () => {
  it("keeps well-formed rows", () => {
    expect(toMyBlockedMrs({ enabled: true, items: [ITEM] })).toEqual({ enabled: true, items: [expect.objectContaining({ iid: "22", mine: "branch", branch: "feature/PBI-1", merge: expect.objectContaining({ blockers: MERGE.blockers }) })] })
  })

  it("drops malformed rows and treats anything unexpected as off (nothing shown)", () => {
    expect(toMyBlockedMrs({ enabled: true, items: [{ ...ITEM, mine: "other" }, { ...ITEM, merge: null }, "x"] }).items).toEqual([])
    expect(toMyBlockedMrs(null)).toEqual({ enabled: false, items: [] })
    expect(toMyBlockedMrs({ enabled: false })).toEqual({ enabled: false, items: [] })
  })
})

import { describe, expect, it } from "vitest"
import { parseProjectUpdates, updatesUrl } from "../use-project-updates"

describe("parseProjectUpdates", () => {
  it("parses a well-formed response", () => {
    const raw = {
      since: "2026-09-01T00:00:00.000Z",
      firstVisit: true,
      newActivity: 3,
      unread: 5,
      mentions: 2,
      activity: [{ id: "a1" }],
      notifications: [{ id: "n1" }],
    }
    expect(parseProjectUpdates(raw)).toEqual(raw)
  })

  it("tolerates garbage input: null, undefined, a string, a number, an array", () => {
    const zero = {
      since: new Date(0).toISOString(),
      firstVisit: false,
      newActivity: 0,
      unread: 0,
      mentions: 0,
      activity: [],
      notifications: [],
    }
    expect(parseProjectUpdates(null)).toEqual(zero)
    expect(parseProjectUpdates(undefined)).toEqual(zero)
    expect(parseProjectUpdates("nope")).toEqual(zero)
    expect(parseProjectUpdates(42)).toEqual(zero)
    expect(parseProjectUpdates([1, 2, 3])).toEqual(zero)
  })

  it("tolerates a partially malformed object: wrong types fall back field by field", () => {
    const out = parseProjectUpdates({
      since: 123,
      firstVisit: "yes",
      newActivity: "5",
      unread: NaN,
      mentions: null,
      activity: "not an array",
      notifications: { not: "an array" },
    })
    expect(out).toEqual({
      since: new Date(0).toISOString(),
      firstVisit: false,
      newActivity: 0,
      unread: 0,
      mentions: 0,
      activity: [],
      notifications: [],
    })
  })

  it("keeps valid counts of zero (falsy but not malformed)", () => {
    const out = parseProjectUpdates({ newActivity: 0, unread: 0, mentions: 0, firstVisit: false })
    expect(out.newActivity).toBe(0)
    expect(out.unread).toBe(0)
    expect(out.mentions).toBe(0)
  })
})

describe("updatesUrl", () => {
  it("builds the per-project endpoint, encoding the id", () => {
    expect(updatesUrl("p1")).toBe("/api/projects/p1/updates")
    expect(updatesUrl("p/1")).toBe("/api/projects/p%2F1/updates")
  })
})

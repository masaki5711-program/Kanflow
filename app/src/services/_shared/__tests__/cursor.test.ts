import { describe, expect, it } from "vitest"
import { afterCursorWhere, decodeCursor, encodeCursor, toPage } from "../cursor"

const at = new Date("2026-10-01T09:00:00.000Z")

describe("cursor", () => {
  it("round-trips", () => {
    expect(decodeCursor(encodeCursor({ createdAt: at, id: "c1" }))).toEqual({ createdAt: at, id: "c1" })
  })

  it.each(["", "garbage", Buffer.from("not-a-date|x").toString("base64url"), Buffer.from(`${at.toISOString()}|`).toString("base64url")])(
    "rejects %j with a 400",
    (bad) => {
      expect(() => decodeCursor(bad)).toThrow(expect.objectContaining({ status: 400, code: "VALIDATION" }))
    }
  )

  it("afterCursorWhere is empty without a cursor, keyset OR otherwise", () => {
    expect(afterCursorWhere(undefined)).toEqual({})
    expect(afterCursorWhere(encodeCursor({ createdAt: at, id: "c1" }))).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: "c1" } }],
    })
  })

  it("toPage drops the probe row and points at the last returned row", () => {
    const rows = [
      { id: "c", createdAt: at },
      { id: "b", createdAt: at },
      { id: "a", createdAt: at },
    ]
    const page = toPage(rows, 2, (r) => r.id)
    expect(page.items).toEqual(["c", "b"])
    expect(decodeCursor(page.nextCursor!)).toEqual({ createdAt: at, id: "b" })
    expect(toPage(rows, 3, (r) => r.id).nextCursor).toBeNull()
    expect(toPage([], 3, (r: { id: string; createdAt: Date }) => r.id)).toEqual({ items: [], nextCursor: null })
  })
})

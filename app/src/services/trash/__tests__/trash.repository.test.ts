import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../trash.repository"

describe("trash.repository", () => {
  it("findUserNames returns an id → name map without querying for an empty list", async () => {
    const empty = fakeDb()
    await expect(repo.findUserNames(empty.client, [])).resolves.toEqual(new Map())
    expect(empty.fn("user.findMany")).not.toHaveBeenCalled()

    const db = fakeDb({ "user.findMany": [{ id: "u1", name: "Alice" }] })
    await expect(repo.findUserNames(db.client, ["u1", "u1", "u2"])).resolves.toEqual(new Map([["u1", "Alice"]]))
    expect(db.fn("user.findMany")).toHaveBeenCalledWith({ where: { id: { in: ["u1", "u2"] } }, select: { id: true, name: true } })
  })
})

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { mineBy } from "../my-blocked-mrs.service"

// Synthetic people and branches only.
describe("N10 mineBy — whose MR it is", () => {
  const none = new Set<string>()

  it("the claim's branch first, then the author's name or employee number as stored", () => {
    expect(mineBy({ sourceBranch: "feature/PBI-2-logout", author: "someone" }, new Set(["feature/PBI-2-logout"]), ["syn user"])).toBe("branch")
    expect(mineBy({ sourceBranch: "x", author: "Syn User" }, none, ["syn user"])).toBe("author")
    expect(mineBy({ sourceBranch: "x", author: "SYN1005" }, none, ["syn1005"])).toBe("author")
  })

  it("the author's employee number from GitStation's development status matches the user's, ignoring case", () => {
    expect(mineBy({ sourceBranch: "x", author: "dora", authorEmployeeNumber: "SYN1005" }, none, ["syn user"], "syn1005")).toBe("author")
    expect(mineBy({ sourceBranch: "x", author: "dora", authorEmployeeNumber: "SYN1001" }, none, ["syn user"], "syn1005")).toBeNull()
    // A user without an employee number never matches an unknown one.
    expect(mineBy({ sourceBranch: "x", author: "dora", authorEmployeeNumber: null }, none, [], null)).toBeNull()
  })
})

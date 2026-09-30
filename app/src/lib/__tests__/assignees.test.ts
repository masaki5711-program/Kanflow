import { describe, expect, it } from "vitest"
import { matchAssigneeName, resolveAssignees, splitAssigneeNames } from "../assignees"
import { backfillReportCsv, planAssigneeBackfill } from "../assignee-backfill"

const users = [
  { id: "u1", name: "Taro Yamada" },
  { id: "u2", name: "山田 花子" },
  { id: "u3", name: "Budi" },
  { id: "u4", name: "Sato" },
  { id: "u5", name: "SATO" },
  { id: "u6", name: "Outsider" },
]

describe("splitAssigneeNames", () => {
  it("returns [] for null, undefined and blank strings", () => {
    expect(splitAssigneeNames(null)).toEqual([])
    expect(splitAssigneeNames(undefined)).toEqual([])
    expect(splitAssigneeNames("  , 、 ")).toEqual([])
  })

  it("splits on ASCII / full-width / ideographic commas, semicolons and newlines", () => {
    expect(splitAssigneeNames("Taro Yamada,Budi，山田 花子、Sato;Ann；Bob\nCarl")).toEqual([
      "Taro Yamada", "Budi", "山田 花子", "Sato", "Ann", "Bob", "Carl",
    ])
  })

  it("keeps spaces inside a name but trims and collapses them (incl. full-width space)", () => {
    expect(splitAssigneeNames("  Taro   Yamada ,　山田　花子　")).toEqual(["Taro Yamada", "山田 花子"])
  })

  it("drops duplicates that differ only by case or spacing, keeping the first spelling", () => {
    expect(splitAssigneeNames("Budi, budi, B udi")).toEqual(["Budi"])
  })
})

describe("matchAssigneeName", () => {
  it("matches exactly after trimming", () => {
    expect(matchAssigneeName(" Taro Yamada ", users)).toEqual({ status: "matched", userId: "u1", tier: "exact" })
  })

  it("prefers an exact hit over case-insensitive ones", () => {
    expect(matchAssigneeName("Sato", users)).toEqual({ status: "matched", userId: "u4", tier: "exact" })
  })

  it("falls back to case-insensitive, including full-width Latin", () => {
    expect(matchAssigneeName("taro yamada", users)).toMatchObject({ status: "matched", userId: "u1", tier: "case_insensitive" })
    expect(matchAssigneeName("ＢＵＤＩ", users)).toMatchObject({ status: "matched", userId: "u3", tier: "case_insensitive" })
  })

  it("reports ambiguity instead of guessing", () => {
    expect(matchAssigneeName("sato", users)).toEqual({ status: "ambiguous", tier: "case_insensitive", userIds: ["u4", "u5"] })
  })

  it("falls back to ignoring spaces", () => {
    expect(matchAssigneeName("山田花子", users)).toEqual({ status: "matched", userId: "u2", tier: "no_spaces" })
    expect(matchAssigneeName("TaroYamada", users)).toMatchObject({ userId: "u1", tier: "no_spaces" })
  })

  it("returns unmatched for unknown or empty names", () => {
    expect(matchAssigneeName("Nobody", users)).toEqual({ status: "unmatched" })
    expect(matchAssigneeName("   ", users)).toEqual({ status: "unmatched" })
  })
})

describe("resolveAssignees", () => {
  const members = users.filter((u) => u.id !== "u6")

  it("resolves every name to distinct user ids in order", () => {
    expect(resolveAssignees("Budi、taro yamada, TaroYamada", members)).toEqual({ userIds: ["u3", "u1"], unresolved: [] })
  })

  it("classifies unmatched, ambiguous and non-member names", () => {
    const result = resolveAssignees("Nobody, sato, Outsider, Budi", members, users)
    expect(result.userIds).toEqual(["u3"])
    expect(result.unresolved).toEqual([
      { name: "Nobody", reason: "unmatched", candidateIds: [] },
      { name: "sato", reason: "ambiguous", candidateIds: ["u4", "u5"] },
      { name: "Outsider", reason: "non_member", candidateIds: ["u6"] },
    ])
  })

  it("treats a non-member hit as unmatched when no fallback is given", () => {
    expect(resolveAssignees("Outsider", members).unresolved).toEqual([{ name: "Outsider", reason: "unmatched", candidateIds: [] }])
  })
})

describe("planAssigneeBackfill", () => {
  const memberships = [
    { projectId: "p1", userId: "u1" },
    { projectId: "p1", userId: "u3" },
    { projectId: "p1", userId: "ghost" },
  ]

  it("scopes matching to project members and skips existing rows", () => {
    const plan = planAssigneeBackfill(
      [
        { id: "t1", projectId: "p1", assignee: "Taro Yamada, Budi", existingUserIds: ["u3"] },
        { id: "t2", projectId: "p1", assignee: "Outsider", existingUserIds: [] },
        { id: "t3", projectId: "p1", assignee: null, existingUserIds: [] },
        { id: "t4", projectId: "p1", assignee: "  ", existingUserIds: [] },
      ],
      users,
      memberships,
    )
    expect(plan.inserts).toEqual([{ taskId: "t1", userId: "u1" }])
    expect(plan.report).toEqual([
      { taskId: "t2", projectId: "p1", assignee: "Outsider", name: "Outsider", reason: "non_member", candidateIds: ["u6"] },
    ])
    expect(plan.stats).toEqual({
      tasksScanned: 4, tasksWithAssignee: 2, namesSeen: 3, namesResolved: 2, alreadyPresent: 1, toInsert: 1, unresolved: 1,
    })
  })

  it("uses every user when the project has no membership rows", () => {
    const plan = planAssigneeBackfill([{ id: "t1", projectId: "p9", assignee: "Outsider", existingUserIds: [] }], users, memberships)
    expect(plan.inserts).toEqual([{ taskId: "t1", userId: "u6" }])
    expect(plan.report).toEqual([])
  })

  it("is idempotent: a second plan over the applied rows inserts nothing", () => {
    const tasks = [{ id: "t1", projectId: "p1", assignee: "Taro Yamada, Budi", existingUserIds: [] as string[] }]
    const first = planAssigneeBackfill(tasks, users, memberships)
    const applied = tasks.map((t) => ({ ...t, existingUserIds: first.inserts.filter((i) => i.taskId === t.id).map((i) => i.userId) }))
    expect(planAssigneeBackfill(applied, users, memberships).inserts).toEqual([])
  })
})

describe("backfillReportCsv", () => {
  it("writes a BOM, a header and escaped CRLF rows", () => {
    const csv = backfillReportCsv([
      { taskId: "t1", projectId: "p1", assignee: 'A, "B"', name: "=cmd", reason: "unmatched", candidateIds: [] },
      { taskId: "t2", projectId: "p1", assignee: "sato", name: "sato", reason: "ambiguous", candidateIds: ["u4", "u5"] },
    ])
    expect(csv).toBe(
      "﻿taskId,projectId,name,reason,candidateIds,assignee\r\n" +
        't1,p1,\'=cmd,unmatched,,"A, ""B"""\r\n' +
        "t2,p1,sato,ambiguous,u4 u5,sato\r\n",
    )
  })

  it("writes only the header for an empty report", () => {
    expect(backfillReportCsv([])).toBe("﻿taskId,projectId,name,reason,candidateIds,assignee\r\n")
  })
})

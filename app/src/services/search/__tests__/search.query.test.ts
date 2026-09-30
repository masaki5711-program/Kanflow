import { describe, expect, it } from "vitest"
import {
  accessibleProjectWhere,
  containsAny,
  escapeLike,
  groupTranslationMatches,
  groupTranslationRanks,
  orderByRank,
  rankIds,
  normalizeQuery,
  parseDisplayId,
  searchHref,
} from "../search.query"

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character itself", () => {
    expect(escapeLike("100%")).toBe("100\\%")
    expect(escapeLike("a_b")).toBe("a\\_b")
    expect(escapeLike("C:\\path")).toBe("C:\\\\path")
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\")
  })

  it("leaves ordinary text (incl. Japanese) unchanged", () => {
    expect(escapeLike("ログイン画面")).toBe("ログイン画面")
    expect(escapeLike("PBI-12")).toBe("PBI-12")
  })
})

describe("normalizeQuery", () => {
  it("trims and collapses whitespace (incl. full-width spaces)", () => {
    expect(normalizeQuery("  foo   bar ")).toBe("foo bar")
    expect(normalizeQuery("\u3000検索\u3000語\u3000")).toBe("検索 語")
  })
})

describe("parseDisplayId", () => {
  it.each([
    ["PBI-12", 12],
    ["pbi-7", 7],
    ["PBI 3", 3],
    ["pbi12", 12],
    ["#12", 12],
    ["# 5", 5],
    ["ＰＢＩ－１２", 12],
    ["＃８", 8],
    ["38", 38],
    ["１２", 12],
  ])("%s → %d", (q, n) => {
    expect(parseDisplayId(q)).toBe(n)
  })

  it.each(["PBI-", "#", "PBI-12a", "abc #12", "#0", "PBI-1234567890", "1234567890", "0", "12 34"])("%s → null", (q) => {
    expect(parseDisplayId(q)).toBeNull()
  })
})

describe("accessibleProjectWhere", () => {
  it("admin: every live project", () => {
    expect(accessibleProjectWhere({ userId: "u1", systemRole: "admin" })).toEqual({ deletedAt: null })
  })

  it("member: only live projects they are a member of", () => {
    expect(accessibleProjectWhere({ userId: "u1", systemRole: "member" })).toEqual({
      deletedAt: null,
      members: { some: { userId: "u1" } },
    })
  })

  it("unknown roles act as member", () => {
    expect(accessibleProjectWhere({ userId: "u1", systemRole: "weird" })).toEqual({
      deletedAt: null,
      members: { some: { userId: "u1" } },
    })
  })

  it("section manager: member projects plus projects of their sections", () => {
    expect(accessibleProjectWhere({ userId: "u1", systemRole: "section_manager" })).toEqual({
      deletedAt: null,
      OR: [
        { members: { some: { userId: "u1" } } },
        { sections: { some: { section: { users: { some: { userId: "u1" } } } } } },
      ],
    })
  })
})

describe("containsAny", () => {
  it("builds one contains clause per column", () => {
    expect(containsAny(["a", "b"], "x\\%")).toEqual([{ a: { contains: "x\\%" } }, { b: { contains: "x\\%" } }])
  })
})

describe("groupTranslationMatches", () => {
  it("groups translation hits by entity type without duplicates", () => {
    const out = groupTranslationMatches([
      { entityType: "backlog_item", entityId: "b1" },
      { entityType: "backlog_item", entityId: "b1" },
      { entityType: "sprint_task", entityId: "t1" },
      { entityType: "unrelated", entityId: "z" },
    ])
    expect(out.backlog_item).toEqual(["b1"])
    expect(out.sprint_task).toEqual(["t1"])
    expect(out.icebox_item).toEqual([])
    expect(out.project).toEqual([])
    expect(out.product_goal).toEqual([])
  })
})

describe("searchHref", () => {
  it("deep-links each type", () => {
    expect(searchHref("pbi", "p1", "b1")).toBe("/projects/p1/backlog?pbi=b1")
    expect(searchHref("task", "p1", "t1")).toBe("/projects/p1/sprints?task=t1")
    expect(searchHref("icebox", "p1", "i1")).toBe("/projects/p1/icebox?item=i1")
    expect(searchHref("project", "p1", "p1")).toBe("/projects/p1")
    expect(searchHref("goal", "p1", "g1")).toBe("/projects/p1")
  })

  it("encodes ids", () => {
    expect(searchHref("pbi", "p 1", "a&b")).toBe("/projects/p%201/backlog?pbi=a%26b")
  })
})

describe("rankIds", () => {
  it("merges lists keeping each id's best score, highest first", () => {
    const direct = [{ id: "a", score: 1 }, { id: "b", score: 3 }]
    const translated = [{ id: "a", score: 5 }, { id: "c", score: 2 }]
    expect(rankIds(direct, translated)).toEqual(["a", "b", "c"])
  })

  it("keeps the first-seen order for equal scores and handles no input", () => {
    expect(rankIds([{ id: "x", score: 1 }, { id: "y", score: 1 }])).toEqual(["x", "y"])
    expect(rankIds()).toEqual([])
  })
})

describe("orderByRank", () => {
  it("orders rows by the ranked id list; unranked rows go last", () => {
    const rows = [{ id: "c" }, { id: "z" }, { id: "a" }, { id: "b" }]
    expect(orderByRank(rows, ["a", "b", "c"]).map((r) => r.id)).toEqual(["a", "b", "c", "z"])
  })
})

describe("groupTranslationRanks", () => {
  it("buckets scored translation hits per searched entity type, ignoring others", () => {
    const out = groupTranslationRanks([
      { entityType: "backlog_item", entityId: "b1", score: 2 },
      { entityType: "project", entityId: "p1", score: 1 },
      { entityType: "comment", entityId: "c1", score: 9 },
    ])
    expect(out.backlog_item).toEqual([{ id: "b1", score: 2 }])
    expect(out.project).toEqual([{ id: "p1", score: 1 }])
    expect(out.sprint_task).toEqual([])
    expect(Object.keys(out)).not.toContain("comment")
  })
})

import { describe, expect, it, vi } from "vitest"
import type { Prisma } from "@/generated/prisma/client"
import * as ft from "../search.fulltext"

const TERMS = ["login", "api"]

/** Minimal Prisma fake: $queryRaw receives one Prisma.Sql object. */
function fakeDb(rows: unknown[] = []) {
  const queryRaw = vi.fn<(sql: Prisma.Sql) => Promise<unknown[]>>(async () => rows)
  const projectFindMany = vi.fn(async () => [{ id: "p1" }, { id: "p2" }])
  const client = { $queryRaw: queryRaw, project: { findMany: projectFindMany } } as never
  const sqlOf = (i = 0) => queryRaw.mock.calls[i][0] as Prisma.Sql
  return { client, queryRaw, projectFindMany, sqlOf }
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim()

describe("findAccessibleProjectIds", () => {
  it("resolves the Prisma scope to live project ids", async () => {
    const db = fakeDb()
    const scope = { deletedAt: null, members: { some: { userId: "u1" } } }
    expect(await ft.findAccessibleProjectIds(db.client, scope)).toEqual(["p1", "p2"])
    expect(db.projectFindMany).toHaveBeenCalledWith({ where: scope, select: { id: true } })
  })
})

describe("per-type trigram candidate queries", () => {
  const cases: Array<[string, (db: never) => Promise<ft.RankedId[]>, string[], string[]]> = [
    [
      "pbi",
      (db) => ft.fulltextPbiIds(db, ["p1", "p2"], TERMS, 7),
      ['FROM "ProductBacklogItem"', '"projectId" IN (?', '"deletedAt" IS NULL'],
      ['"initiative"', '"epic"', '"userStory"', '"acceptanceCriteria"'],
    ],
    [
      "task",
      (db) => ft.fulltextTaskIds(db, ["p1", "p2"], TERMS, 7),
      ['FROM "SprintBacklogItem" t', 'JOIN "Sprint" s', 'JOIN "ProductBacklogItem" p', 's."projectId" IN (?', 'p."deletedAt" IS NULL'],
      ['t."taskName"'],
    ],
    [
      "icebox",
      (db) => ft.fulltextIceboxIds(db, ["p1", "p2"], TERMS, 7),
      ['FROM "IceboxItem"', '"projectId" IN (?', '"deletedAt" IS NULL'],
      ['"request"', '"background"', '"pbEpic"'],
    ],
    ["project", (db) => ft.fulltextProjectIds(db, ["p1", "p2"], TERMS, 7), ['FROM "Project"', '"id" IN (?', '"deletedAt" IS NULL'], ['"name"']],
    ["goal", (db) => ft.fulltextGoalIds(db, ["p1", "p2"], TERMS, 7), ['FROM "ProductGoal"', '"projectId" IN (?'], ['"title"', '"description"']],
  ]

  it.each(cases)("%s: parameterized, case-insensitive per term, scoped, relevance-ordered and capped", async (_name, run, fragments, cols) => {
    const db = fakeDb([{ id: "x", score: 1.5 }, { id: "y", score: "0.25" }])
    const out = await run(db.client)
    const sql = flat(db.sqlOf().sql)
    for (const f of fragments) expect(sql).toContain(f)
    // Every searched column is matched with ILIKE (pg_trgm GIN indexes) and scored with word_similarity.
    for (const c of cols) {
      expect(sql).toMatch(new RegExp(`${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ILIKE \\?`))
    }
    expect(sql).toContain("word_similarity(?")
    expect(sql).toMatch(/\) AND \(/) // all terms required
    expect(sql).toMatch(/ORDER BY score DESC, .*"updatedAt" DESC LIMIT \?$/)
    // Terms are bound, never interpolated.
    expect(sql).not.toContain("login")
    const values = db.sqlOf().values
    expect(values).toEqual(expect.arrayContaining(["login", "api", "%login%", "%api%", "p1", "p2"]))
    expect(values.at(-1)).toBe(7)
    expect(out).toEqual([{ id: "x", score: 1.5 }, { id: "y", score: 0.25 }])
  })

  it("skips the query when there is no accessible project", async () => {
    const db = fakeDb()
    expect(await ft.fulltextPbiIds(db.client, [], TERMS, 7)).toEqual([])
    expect(db.queryRaw).not.toHaveBeenCalled()
  })
})

describe("findFulltextCandidates", () => {
  it("queries every searched type with the same scope and cap", async () => {
    const db = fakeDb([{ id: "x", score: 1 }])
    const out = await ft.findFulltextCandidates(db.client, ["p1"], TERMS)
    expect(db.queryRaw).toHaveBeenCalledTimes(5)
    expect(Object.keys(out).sort()).toEqual(["goal", "icebox", "pbi", "project", "task"])
    expect(db.sqlOf().values.at(-1)).toBe(ft.FULLTEXT_CANDIDATE_CAP)
  })
})

describe("findTranslationFulltext", () => {
  it("matches either language of the searched fields only, most relevant first", async () => {
    const db = fakeDb([{ entityType: "backlog_item", entityId: "b1", score: 2 }])
    const out = await ft.findTranslationFulltext(db.client, TERMS)
    const sql = flat(db.sqlOf().sql)
    expect(sql).toContain('FROM "field_translation"')
    expect(sql).toMatch(/"text_ja" ILIKE \? OR "text_id" ILIKE \?/)
    // Quoted aliases: PostgreSQL would fold entityType to entitytype.
    expect(sql).toContain('AS "entityType"')
    expect(sql).toContain('AS "entityId"')
    expect(sql).not.toContain("GROUP BY") // rankIds de-duplicates
    expect(sql).toContain("ORDER BY score DESC")
    expect(sql).toMatch(/LIMIT \?$/)
    const values = db.sqlOf().values
    expect(values).toEqual(expect.arrayContaining(["login", "%login%", "backlog_item", "initiative", "acceptanceCriteria", "sprint_task", "taskName", "product_goal"]))
    expect(values.at(-1)).toBe(ft.TRANSLATION_FULLTEXT_CAP)
    expect(out).toEqual([{ entityType: "backlog_item", entityId: "b1", score: 2 }])
  })

  it("can be limited to some entity types", async () => {
    const db = fakeDb([])
    await ft.findTranslationFulltext(db.client, TERMS, ["pbi"])
    const values = db.sqlOf().values
    expect(values).toContain("backlog_item")
    expect(values).not.toContain("project")
  })
})

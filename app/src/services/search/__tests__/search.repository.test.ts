import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../search.repository"

const SCOPE = { deletedAt: null, members: { some: { userId: "u1" } } }
const SM_SCOPE = { deletedAt: null, OR: [{ members: { some: { userId: "u1" } } }, { sections: { some: {} } }] }
const match = (over: Partial<repo.EntityMatch> = {}) => ({ pattern: "a\\%b", ids: [] as string[], take: 5, ...over })
const whereOf = (db: ReturnType<typeof fakeDb>, key: string) => db.fn(key).mock.calls[0][0]

describe("search.repository", () => {
  it("findTranslationMatches: searched fields per entity type, either language, capped", async () => {
    const db = fakeDb()
    await repo.findTranslationMatches(db.client, "x\\_y")
    const args = whereOf(db, "fieldTranslation.findMany")
    expect(args.where.AND).toEqual([{ OR: [{ textJa: { contains: "x\\_y" } }, { textId: { contains: "x\\_y" } }] }])
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { entityType: "backlog_item", field: { in: ["initiative", "epic", "userStory", "acceptanceCriteria"] } },
        { entityType: "sprint_task", field: { in: ["taskName"] } },
        { entityType: "icebox_item", field: { in: ["request", "background", "pbEpic"] } },
        { entityType: "project", field: { in: ["name"] } },
        { entityType: "product_goal", field: { in: ["title", "description"] } },
      ])
    )
    expect(args.take).toBe(repo.TRANSLATION_MATCH_CAP)
    expect(args.select).toEqual({ entityType: true, entityId: true })
  })

  it("findPbis: live PBIs of accessible projects, text + translated ids + exact displayId", async () => {
    const db = fakeDb()
    await repo.findPbis(db.client, SCOPE, { ...match({ ids: ["b9"] }), displayId: 12 })
    const args = whereOf(db, "productBacklogItem.findMany")
    expect(args.where.deletedAt).toBeNull()
    expect(args.where.project).toBe(SCOPE)
    expect(args.where.OR).toEqual([
      { initiative: { contains: "a\\%b" } },
      { epic: { contains: "a\\%b" } },
      { userStory: { contains: "a\\%b" } },
      { acceptanceCriteria: { contains: "a\\%b" } },
      { id: { in: ["b9"] } },
      { displayId: 12 },
    ])
    expect(args.take).toBe(5)
  })

  it("findPbis: no id / displayId clause when there is nothing to match", async () => {
    const db = fakeDb()
    await repo.findPbis(db.client, SCOPE, { ...match(), displayId: null })
    const or = whereOf(db, "productBacklogItem.findMany").where.OR as object[]
    expect(or).toHaveLength(4)
  })

  it("findTasks: parent PBI must be live and the sprint's project accessible", async () => {
    const db = fakeDb()
    await repo.findTasks(db.client, SCOPE, match({ ids: ["t1"] }))
    const args = whereOf(db, "sprintBacklogItem.findMany")
    expect(args.where.pbItem).toEqual({ deletedAt: null })
    expect(args.where.sprint).toEqual({ project: SCOPE })
    expect(args.where.OR).toEqual([{ taskName: { contains: "a\\%b" } }, { id: { in: ["t1"] } }])
  })

  it("findIceboxItems: live items of accessible projects", async () => {
    const db = fakeDb()
    await repo.findIceboxItems(db.client, SCOPE, match())
    const args = whereOf(db, "iceboxItem.findMany")
    expect(args.where).toMatchObject({ deletedAt: null, project: SCOPE })
    expect(args.where.OR).toHaveLength(3)
  })

  it("findProjects: the scope is ANDed so a section manager's OR is not overwritten", async () => {
    const db = fakeDb()
    await repo.findProjects(db.client, SM_SCOPE, match({ ids: ["p2"] }))
    const args = whereOf(db, "project.findMany")
    expect(args.where).toEqual({ AND: [SM_SCOPE, { OR: [{ name: { contains: "a\\%b" } }, { id: { in: ["p2"] } }] }] })
  })

  it("findGoals: goals of accessible projects (title / description)", async () => {
    const db = fakeDb()
    await repo.findGoals(db.client, SCOPE, match())
    const args = whereOf(db, "productGoal.findMany")
    expect(args.where).toEqual({ project: SCOPE, OR: [{ title: { contains: "a\\%b" } }, { description: { contains: "a\\%b" } }] })
  })
})

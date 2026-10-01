import { describe, expect, it } from "vitest"
import { DORMANT_DAYS, daysSinceActivity, dormantDays, lastActivityTime } from "../dormancy"
import { filterAndSortProjects } from "../filter-projects"
import type { Project } from "../types"

const NOW = new Date("2026-10-01T12:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

function project(over: Partial<Project> & { id: string }): Project {
  return {
    name: over.id,
    description: null,
    status: "active",
    projectType: "software",
    members: [],
    _count: { iceboxItems: 0, backlogItems: 0, sprints: 0 },
    progressPct: 0,
    ...over,
  }
}

describe("dormancy", () => {
  it("uses lastActivityAt, then updatedAt, then createdAt", () => {
    expect(lastActivityTime(project({ id: "a", lastActivityAt: daysAgo(1), updatedAt: daysAgo(5) }))).toBe(Date.parse(daysAgo(1)))
    expect(lastActivityTime(project({ id: "a", updatedAt: daysAgo(5) }))).toBe(Date.parse(daysAgo(5)))
    expect(lastActivityTime(project({ id: "a", createdAt: new Date(daysAgo(9)) }))).toBe(Date.parse(daysAgo(9)))
    expect(lastActivityTime(project({ id: "a", lastActivityAt: "garbage" }))).toBeNull()
    expect(daysSinceActivity(project({ id: "a" }), NOW)).toBeNull()
  })

  it("flags active projects idle for DORMANT_DAYS or more", () => {
    expect(DORMANT_DAYS).toBe(60)
    expect(dormantDays(project({ id: "a", lastActivityAt: daysAgo(59) }), NOW)).toBeNull()
    expect(dormantDays(project({ id: "a", lastActivityAt: daysAgo(60) }), NOW)).toBe(60)
    expect(dormantDays(project({ id: "a", lastActivityAt: daysAgo(200) }), NOW)).toBe(200)
    expect(dormantDays(project({ id: "a", lastActivityAt: daysAgo(10) }), NOW, 5)).toBe(10)
  })

  it("never flags archived projects or unknown dates", () => {
    expect(dormantDays(project({ id: "a", status: "archived", lastActivityAt: daysAgo(400) }), NOW)).toBeNull()
    expect(dormantDays(project({ id: "a" }), NOW)).toBeNull()
  })
})

describe("filterAndSortProjects: last activity + dormant filter", () => {
  const list = [
    project({ id: "mid", lastActivityAt: daysAgo(30) }),
    project({ id: "old", lastActivityAt: daysAgo(90) }),
    project({ id: "new", lastActivityAt: daysAgo(1) }),
    project({ id: "unknown" }),
  ]
  const base = { query: "", typeFilter: "all" as const, language: "ja" as const, isFav: () => false, now: NOW }

  it("sorts newest / oldest activity first (unknown = oldest)", () => {
    expect(filterAndSortProjects(list, { ...base, sortBy: "activity_desc" }).map((p) => p.id)).toEqual(["new", "mid", "old", "unknown"])
    expect(filterAndSortProjects(list, { ...base, sortBy: "activity_asc" }).map((p) => p.id)).toEqual(["unknown", "old", "mid", "new"])
  })

  it("keeps only dormant projects when dormantOnly is set", () => {
    expect(filterAndSortProjects(list, { ...base, sortBy: "updated", dormantOnly: true }).map((p) => p.id)).toEqual(["old"])
    expect(filterAndSortProjects(list, { ...base, sortBy: "updated", dormantOnly: false })).toHaveLength(4)
  })
})

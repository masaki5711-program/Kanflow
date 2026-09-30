import { describe, expect, it } from "vitest"
import { filterAndSortProjects } from "../filter-projects"
import {
  clampPct,
  colorLabel,
  hasCriticalAiReport,
  projectTypeEmoji,
  projectTypeLabel,
  type Project,
} from "../types"
import { getTranslations } from "@/lib/i18n"

function project(over: Partial<Project> & { id: string; name: string }): Project {
  return {
    description: null,
    status: "active",
    projectType: "software",
    members: [],
    _count: { iceboxItems: 0, backlogItems: 0, sprints: 0 },
    progressPct: 0,
    ...over,
  }
}

const list: Project[] = [
  project({ id: "a", name: "Bravo", progressPct: 10, members: [{ role: "po", user: { id: "u1", name: "Tanaka" } }] }),
  project({ id: "b", name: "alpha", projectType: "process_improvement", progressPct: 80, description: "Line kaizen" }),
  project({
    id: "c",
    name: "Charlie",
    progressPct: 50,
    i18n: { name: { ja: "チャーリー", id: "Charlie ID", source: "ja", status: "done" } } as Project["i18n"],
  }),
]

const base = { query: "", typeFilter: "all" as const, sortBy: "updated" as const, language: "en" as const, isFav: () => false }

describe("filterAndSortProjects", () => {
  it("keeps server order for 'updated' and returns a new array", () => {
    const out = filterAndSortProjects(list, base)
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(out).not.toBe(list)
  })

  it("filters by project type", () => {
    const out = filterAndSortProjects(list, { ...base, typeFilter: "process_improvement" })
    expect(out.map((p) => p.id)).toEqual(["b"])
  })

  it("matches query against name, description, member names and translated text (case-insensitive, trimmed)", () => {
    expect(filterAndSortProjects(list, { ...base, query: "  TANAKA " }).map((p) => p.id)).toEqual(["a"])
    expect(filterAndSortProjects(list, { ...base, query: "kaizen" }).map((p) => p.id)).toEqual(["b"])
    expect(filterAndSortProjects(list, { ...base, query: "チャーリー" }).map((p) => p.id)).toEqual(["c"])
    expect(filterAndSortProjects(list, { ...base, query: "charlie id" }).map((p) => p.id)).toEqual(["c"])
    expect(filterAndSortProjects(list, { ...base, query: "zzz" })).toEqual([])
  })

  it("sorts by name A→Z and Z→A (legacy name_asc key) using the shown name", () => {
    expect(filterAndSortProjects(list, { ...base, sortBy: "name" }).map((p) => p.id)).toEqual(["b", "a", "c"])
    expect(filterAndSortProjects(list, { ...base, sortBy: "name_asc" }).map((p) => p.id)).toEqual(["c", "a", "b"])
    // In Japanese the translated name "チャーリー" sorts after latin names.
    expect(filterAndSortProjects(list, { ...base, sortBy: "name", language: "ja" }).map((p) => p.id)).toEqual(["b", "a", "c"])
  })

  it("sorts by progress descending and favorites first (stable)", () => {
    expect(filterAndSortProjects(list, { ...base, sortBy: "progress" }).map((p) => p.id)).toEqual(["b", "c", "a"])
    const fav = filterAndSortProjects(list, { ...base, sortBy: "favorite", isFav: (p) => p.id === "c" })
    expect(fav.map((p) => p.id)).toEqual(["c", "a", "b"])
  })
})

describe("project list type helpers", () => {
  it("clamps progress into 0..100", () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(140)).toBe(100)
    expect(clampPct(null)).toBe(0)
    expect(clampPct(42)).toBe(42)
  })

  it("maps type emoji and localized labels with fallbacks", () => {
    expect(projectTypeEmoji("software")).toBe("💻")
    expect(projectTypeEmoji("unknown")).toBe("📋")
    expect(projectTypeLabel("unknown", "ja")).toBe("unknown")
    const ja = projectTypeLabel("software", "ja")
    const en = projectTypeLabel("software", "en")
    const id = projectTypeLabel("software", "id")
    expect(new Set([ja, en, id]).size).toBeGreaterThan(1)
  })

  it("flags critical AI reports by the red emoji", () => {
    expect(hasCriticalAiReport(project({ id: "x", name: "x", aiReports: [{ id: "r", title: "🔴 bad" }] }))).toBe(true)
    expect(hasCriticalAiReport(project({ id: "x", name: "x", aiReports: [{ id: "r", title: "🟢 ok" }] }))).toBe(false)
    expect(hasCriticalAiReport(project({ id: "x", name: "x" }))).toBe(false)
  })

  it("returns the translated color label", () => {
    const t = getTranslations("en")
    expect(colorLabel(t, "red")).toBe(t.projectColorRed)
  })
})

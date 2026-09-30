import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { entityHref, entityLabel, feedSentence, statusLabel, type FeedEntry } from "../activity-sentence"

const ja = getTranslations("ja")
const en = getTranslations("en")

function entry(over: Partial<FeedEntry>): FeedEntry {
  return {
    id: "a1",
    entityType: "pbi",
    entityId: "pb1",
    action: "create",
    actor: { id: "u1", name: "Alice" },
    changes: null,
    label: "Login page",
    meta: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    ...over,
  }
}

const full = (s: ReturnType<typeof feedSentence>) => `${s.before}${s.entity}${s.after}${s.statusTo ? ` ${s.statusTo}` : ""}`

describe("feedSentence", () => {
  it.each([
    ["create", "Alice created PBI “Login page”"],
    ["update", "Alice updated PBI “Login page”"],
    ["delete", "Alice deleted PBI “Login page”"],
    ["assign", "Alice changed the assignee of PBI “Login page”"],
    ["move", "Alice moved PBI “Login page”"],
    ["restore", "Alice restored PBI “Login page”"],
    ["comment", "Alice commented on PBI “Login page”"],
    ["mystery", "Alice updated PBI “Login page”"],
  ])("renders %s in English", (action, text) => {
    expect(full(feedSentence(entry({ action }), "p1", en, "en"))).toBe(text)
  })

  it("shows the entity label in the viewer's language when translated", () => {
    const entityI18n = { taskName: { ja: "設計タスク", id: "Tugas desain", source: "ja" as const, status: "done" as const } }
    const e = entry({ entityType: "sprint_task", entityId: "t1", label: "設計タスク", entityI18n })
    expect(feedSentence(e, "p1", getTranslations("id"), "id").entity).toContain("Tugas desain")
    expect(feedSentence(e, "p1", ja, "ja").entity).toContain("設計タスク")
  })

  it("renders Japanese with 「」 quotes around the label", () => {
    const s = feedSentence(entry({ entityType: "sprint_task", entityId: "t1", label: "テスト" }), "p1", ja, "ja")
    expect(full(s)).toBe(`Alice が${ja.dashboardFeedEntitySprintTask}「テスト」を作成しました`)
  })

  it("appends the localized target status of a status change", () => {
    const task = feedSentence(
      entry({ entityType: "sprint_task", action: "status_change", label: "Docs", changes: { status: { from: "todo", to: "done" } } }),
      "p1", en, "en",
    )
    expect(full(task)).toBe(`Alice changed the status of task “Docs” → ${en.taskDone}`)
    const pbi = feedSentence(entry({ action: "status_change", changes: { status: { from: "ready", to: "completed" } } }), "p1", en, "en")
    expect(pbi.statusTo).toBe(`→ ${en.backlogStatusCompleted}`)
    const sprint = feedSentence(entry({ entityType: "sprint", action: "status_change", changes: { status: { from: "active", to: "weird" } } }), "p1", en, "en")
    expect(sprint.statusTo).toBe("→ weird")
    expect(feedSentence(entry({ action: "status_change", changes: { status: { changed: true } } }), "p1", en, "en").statusTo).toBeNull()
    expect(feedSentence(entry({ action: "update", changes: { status: { from: "a", to: "b" } } }), "p1", en, "en").statusTo).toBeNull()
  })

  it("falls back to the system actor, the bare entity word and hides member ids", () => {
    expect(full(feedSentence(entry({ actor: null, label: null }), "p1", en, "en"))).toBe(`${en.historySystem} created PBI`)
    expect(feedSentence(entry({ entityType: "member", label: "user-cuid" }), "p1", en, "en").entity).toBe("member")
    expect(feedSentence(entry({ entityType: "widget" }), "p1", en, "en").entity).toBe("widget “Login page”")
  })

  it("names entities logged without a label from the diff or meta (S-12)", () => {
    const moved = entry({ action: "move", label: null, changes: { sprintId: { from: null, to: "s1" } }, meta: { displayId: 12 } })
    expect(full(feedSentence(moved, "p1", en, "en"))).toBe("Alice moved PBI “#12”")
    const renamed = entry({ entityType: "sprint", action: "update", label: null, changes: { sprintName: { from: "Old", to: "New\nsecond" } } })
    expect(feedSentence(renamed, "p1", ja, "ja").entity).toBe(`${ja.dashboardFeedEntitySprint}「New」`)
    const deleted = entry({ entityType: "sprint_task", action: "delete", label: "  ", changes: { taskName: { from: "Docs", to: null } } })
    expect(feedSentence(deleted, "p1", en, "en").entity).toBe(`${en.dashboardFeedEntitySprintTask} “Docs”`)
    expect(feedSentence(entry({ label: null, meta: { entityLabel: "From meta" } }), "p1", en, "en").entity).toBe("PBI “From meta”")
    expect(entityLabel({ entityType: "pbi", label: null, changes: { status: { changed: true } }, meta: null })).toBeNull()
  })
})

describe("entityHref", () => {
  it.each([
    ["pbi", "/projects/p1/backlog?pbi=x%2F1"],
    ["sprint_task", "/projects/p1/sprints?task=x%2F1"],
    ["sprint", "/projects/p1/sprints?sprint=x%2F1"],
    ["icebox", "/projects/p1/icebox?item=x%2F1"],
    ["release", "/projects/p1/releases"],
    ["plan_item", "/projects/p1/plan"],
    ["goal", null],
    ["project", null],
    ["member", null],
  ])("links %s", (entityType, href) => {
    expect(entityHref("p1", { entityType, entityId: "x/1", action: "update" })).toBe(href)
  })

  it("never links deleted entities", () => {
    expect(entityHref("p1", { entityType: "pbi", entityId: "x", action: "delete" })).toBeNull()
  })
})

describe("member entries (S-12)", () => {
  const idT = getTranslations("id")

  it("names the member by user name and says 'added' for a new member", () => {
    const added = feedSentence(entry({ entityType: "member", label: "user-cuid", meta: { userName: "Budi" } }), "p1", idT, "id")
    expect(`${added.before}${added.entity}${added.after}`).toBe("Alice menambahkan anggota “Budi”")
    const jaAdded = feedSentence(entry({ entityType: "member", label: "user-cuid", meta: { userName: "Budi" } }), "p1", ja, "ja")
    expect(`${jaAdded.before}${jaAdded.entity}${jaAdded.after}`).toBe("Alice がメンバー「Budi」を追加しました")
  })

  it("names a removed member and never shows the user id", () => {
    const removed = feedSentence(entry({ entityType: "member", action: "delete", label: "user-cuid", meta: { userName: "Budi" } }), "p1", ja, "ja")
    expect(`${removed.before}${removed.entity}${removed.after}`).toBe("Alice がメンバー「Budi」を削除しました")
    expect(entityLabel({ entityType: "member", label: "user-cuid", changes: null, meta: { userName: "  " } })).toBeNull()
  })
})

describe("statusLabel (A4-01: no raw status codes in the feed)", () => {
  const id = getTranslations("id")
  const RAW = /^(not_started|in_progress|on_hold|done|delayed|todo|review|ready|not_ready|completed|planning|active|archived|unreviewed|reviewed|frozen|staged|released|deferred)$/

  it.each([
    ["plan_item", ["not_started", "in_progress", "done", "on_hold", "delayed"]],
    ["sprint_task", ["todo", "in_progress", "review", "done"]],
    ["pbi", ["ready", "not_ready", "completed"]],
    ["sprint", ["planning", "active", "review", "done", "archived"]],
    ["icebox", ["unreviewed", "reviewed", "completed", "frozen"]],
    ["project", ["active", "archived"]],
    ["release", ["staged", "ready", "released", "deferred"]],
  ] as const)("localizes every %s status in ja and id", (entityType, codes) => {
    for (const [lang, t] of [["ja", ja], ["id", id]] as const) {
      const pt = getProjectTypeLabels("software", lang)
      for (const code of codes) expect(statusLabel(entityType, code, t, pt)).not.toMatch(RAW)
    }
  })

  it("renders plan-item status changes with the plan labels", () => {
    const e = entry({ entityType: "plan_item", action: "status_change", label: "現状把握", changes: { status: { from: "in_progress", to: "on_hold" } } })
    expect(feedSentence(e, "p1", ja, "ja").statusTo).toBe(`→ ${ja.planStatusOnHold}`)
    const e2 = entry({ entityType: "plan_item", action: "status_change", changes: { status: { from: "not_started", to: "in_progress" } } })
    expect(feedSentence(e2, "p1", id, "id").statusTo).toBe(`→ ${id.planStatusInProgress}`)
  })

  it("uses the project-type release labels when given", () => {
    const pt = getProjectTypeLabels("software", "ja")
    const e = entry({ entityType: "release", action: "status_change", changes: { status: { from: "staged", to: "released" } } })
    expect(feedSentence(e, "p1", ja, "ja", pt).statusTo).toBe(`→ ${pt.releaseStatusReleased}`)
    expect(feedSentence(e, "p1", ja, "ja").statusTo).toBe("→ released")
  })
})

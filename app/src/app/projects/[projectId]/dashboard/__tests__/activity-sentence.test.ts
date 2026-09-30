import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { entityHref, feedSentence, type FeedEntry } from "../activity-sentence"

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
})

describe("entityHref", () => {
  it.each([
    ["pbi", "/projects/p1/backlog?pbi=x%2F1"],
    ["sprint_task", "/projects/p1/sprints?task=x%2F1"],
    ["sprint", "/projects/p1/sprints"],
    ["icebox", "/projects/p1/icebox"],
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

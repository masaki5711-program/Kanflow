import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { badgeText, describeNotification, formatShortDate, notificationHref, type NotificationItem } from "./notification-format"

const t = getTranslations("en")
const ja = getTranslations("ja")

function item(type: string, payload: Record<string, unknown>, over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    type,
    projectId: "p1",
    project: { id: "p1", name: "Apollo" },
    entityType: null,
    entityId: null,
    payload,
    readAt: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    ...over,
  }
}

describe("describeNotification", () => {
  it("assigned (task) → sentence, project, sprint task deep link", () => {
    const n = item("assigned", { entityLabel: "Write tests\nmore", actorName: "Alice", sprintId: "s1" }, { entityType: "sprint_task", entityId: "t1" })
    expect(describeNotification(n, t, "en")).toEqual({
      text: "Alice assigned you to “Write tests”",
      projectName: "Apollo",
      href: "/projects/p1/sprints?task=t1",
    })
  })

  it("assigned (PBI) links to the backlog deep link; missing actor / label fall back", () => {
    const n = item("assigned", { displayId: 3 }, { entityType: "pbi", entityId: "b1" })
    const d = describeNotification(n, t, "en")
    expect(d.text).toBe(`${t.notifSomeone} assigned you to “${t.notifUntitled}”`)
    expect(d.href).toBe("/projects/p1/backlog?pbi=b1")
  })

  it("sprint_start / sprint_end", () => {
    const start = item(
      "sprint_start",
      { sprintName: "Sprint 5", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-14T00:00:00.000Z", actorName: "Bob" },
      { entityType: "sprint", entityId: "s5" }
    )
    const d = describeNotification(start, t, "en")
    expect(d.text).toMatch(/^Sprint “Sprint 5” started \(Oct \d+ – Oct \d+\)$/)
    expect(d.href).toBe("/projects/p1/sprints?sprint=s5")
    expect(describeNotification(item("sprint_end", { sprintName: "Sprint 5" }), t, "en").text).toBe("Sprint “Sprint 5” ended")
  })

  it("due_soon / overdue format the local due date; plan items link to the plan", () => {
    const due = item("due_soon", { entityLabel: "Task", dueDate: "2026-10-03", sprintId: "s1", sprintName: "S" }, { entityType: "sprint_task", entityId: "t9" })
    expect(describeNotification(due, t, "en")).toMatchObject({ text: "“Task” is due soon (Oct 3)", href: "/projects/p1/sprints?task=t9" })
    const late = item("overdue", { entityLabel: "Milestone", dueDate: "2026-09-28" }, { entityType: "plan_item", entityId: "pl1" })
    expect(describeNotification(late, t, "en")).toMatchObject({ text: "“Milestone” is overdue (Sep 28)", href: "/projects/p1/plan" })
  })

  it("surveillance_critical uses the payload project name and links to the dashboard", () => {
    const n = item(
      "surveillance_critical",
      { reportId: "r1", title: "Daily check", projectName: "Zeus", criticalCount: 2 },
      { project: null, entityType: "ai_report", entityId: "r1" }
    )
    expect(describeNotification(n, t, "en")).toEqual({
      text: "AI surveillance report “Daily check” found 2 critical issue(s)",
      projectName: "Zeus",
      href: "/projects/p1",
    })
  })

  it.each([
    ["pbi", "b1", "/projects/p1/backlog?pbi=b1"],
    ["sprint_task", "t1", "/projects/p1/sprints?task=t1"],
    ["icebox", "i1", "/projects/p1/icebox?item=i1"],
  ])("mentioned / comment on %s link to its deep link", (entityType, entityId, href) => {
    const payload = { entityLabel: "#12 Login", actorName: "Carol", excerpt: "hi", entityType, entityId, commentId: "c1" }
    const mention = item("mentioned", payload, { entityType, entityId })
    expect(describeNotification(mention, t, "en")).toMatchObject({ text: "Carol mentioned you in a comment on “#12 Login”", href })
    expect(describeNotification(item("comment", payload), t, "en")).toMatchObject({ text: "Carol commented on “#12 Login”", href })
  })

  it("renders Japanese sentences", () => {
    const n = item("comment", { entityLabel: "ログイン", actorName: "山田" })
    expect(describeNotification(n, ja, "ja").text).toBe("山田 さんが「ログイン」にコメントしました")
  })

  it("unknown types get a generic sentence; no project → no link", () => {
    const n = item("future_type", {}, { projectId: null, project: null })
    expect(describeNotification(n, t, "en")).toEqual({ text: t.notifUnknown, projectName: null, href: null })
    expect(notificationHref(item("assigned", {}, { entityType: "pbi", entityId: null }))).toBe("/projects/p1")
    expect(notificationHref(item("assigned", {}, { entityType: "weird", entityId: "x" }))).toBe("/projects/p1")
  })
})

describe("helpers", () => {
  it("formatShortDate", () => {
    expect(formatShortDate(null, "en")).toBe("")
    expect(formatShortDate("garbage", "en")).toBe("garbage")
    expect(formatShortDate("2026-01-05", "en")).toBe("Jan 5")
  })

  it("badgeText caps at 99+", () => {
    expect(badgeText(1)).toBe("1")
    expect(badgeText(99)).toBe("99")
    expect(badgeText(100)).toBe("99+")
  })
})

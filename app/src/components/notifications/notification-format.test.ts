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
  it("shows the entity title in the viewer's language when translated (A3-08)", () => {
    const entityI18n = {
      userStory: { ja: "E2E-ACC-3 受入テスト用PBI", id: "E2E-ACC-3 PBI untuk Uji Penerimaan", source: "ja" as const, status: "done" as const },
    }
    const mention = item(
      "mentioned",
      { entityLabel: "#238 E2E-ACC-3 受入テスト用PBI", actorName: "PO", entityType: "pbi", entityId: "b1" },
      { entityType: "pbi", entityId: "b1", entityI18n }
    )
    const idText = describeNotification(mention, getTranslations("id"), "id").text
    expect(idText).toContain("#238 E2E-ACC-3 PBI untuk Uji Penerimaan")
    expect(describeNotification(mention, ja, "ja").text).toContain("#238 E2E-ACC-3 受入テスト用PBI")
    // A label that no longer matches the source (renamed since) stays as stored.
    const stale = item("mentioned", { entityLabel: "#238 old title", entityType: "pbi", entityId: "b1" }, { entityI18n })
    expect(describeNotification(stale, t, "id").text).toContain("#238 old title")
  })

  it("translates plan item names in due notices", () => {
    const entityI18n = { name: { ja: "ISとの調整", id: "Koordinasi dengan IS", source: "id" as const, status: "done" as const } }
    const n = item("due_soon", { entityLabel: "Koordinasi dengan IS", dueDate: "2026-10-03" }, { entityType: "plan_item", entityId: "pl1", entityI18n })
    expect(describeNotification(n, ja, "ja").text).toContain("ISとの調整")
    expect(describeNotification(n, getTranslations("id"), "id").text).toContain("Koordinasi dengan IS")
  })

  it("translates sprint names in sprint notices (A3-08)", () => {
    const entityI18n = { sprintName: { ja: "スプリント1", id: "Sprint 1", source: "ja" as const, status: "done" as const } }
    const n = item("sprint_end", { sprintName: "スプリント1" }, { entityType: "sprint", entityId: "s1", entityI18n })
    expect(describeNotification(n, getTranslations("id"), "id").text).toContain("Sprint 1")
  })

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
    // No title: the PBI is still named by its number.
    expect(d.text).toBe(`${t.notifSomeone} assigned you to “#3”`)
    expect(d.href).toBe("/projects/p1/backlog?pbi=b1")
  })

  it("names a PBI '#displayId title' even in older assignment rows (F-06)", () => {
    const legacy = item("assigned", { entityLabel: "As a user", displayId: 73, actorName: "Ann" }, { entityType: "pbi", entityId: "b1" })
    expect(describeNotification(legacy, t, "en").text).toBe("Ann assigned you to “#73 As a user”")
    const current = item("assigned", { entityLabel: "#73 Login", displayId: 73, actorName: "Ann" }, { entityType: "pbi", entityId: "b1" })
    expect(describeNotification(current, t, "en").text).toBe("Ann assigned you to “#73 Login”")
    const task = item("assigned", { entityLabel: "Write", displayId: 5 }, { entityType: "sprint_task", entityId: "t1" })
    expect(describeNotification(task, t, "en").text).toContain("“Write”")
  })

  it("shows the project name in the viewer's language when translated (F-06)", () => {
    const i18n = { name: { ja: "IoT パイロット", id: "Pilot IoT", source: "id" as const, status: "done" as const } }
    const n = item("sprint_end", { sprintName: "S" }, { project: { id: "p1", name: "Pilot IoT", i18n } as never })
    expect(describeNotification(n, t, "ja").projectName).toBe("IoT パイロット")
    expect(describeNotification(n, t, "id").projectName).toBe("Pilot IoT")
    expect(describeNotification(item("sprint_end", {}), t, "ja").projectName).toBe("Apollo")
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
    ["pbi", "b1", "/projects/p1/backlog?pbi=b1&tab=comments"],
    ["sprint_task", "t1", "/projects/p1/sprints?task=t1&tab=comments"],
    ["icebox", "i1", "/projects/p1/icebox?item=i1&tab=comments"],
  ])("mentioned / comment on %s open its comment thread (F-05)", (entityType, entityId, href) => {
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

describe("notificationHref deep links (param names the target pages read)", () => {
  it.each([
    ["sprint_task", "t1", "/projects/p1/sprints?task=t1"],
    ["sprint", "s1", "/projects/p1/sprints?sprint=s1"],
    ["icebox", "i/1", "/projects/p1/icebox?item=i%2F1"],
    ["pbi", "b1", "/projects/p1/backlog?pbi=b1"],
  ])("%s → %s", (entityType, entityId, href) => {
    expect(notificationHref(item("assigned", {}, { entityType, entityId }))).toBe(href)
  })

  it("comments and mentions link to the commented entity from the payload", () => {
    const n = item("mentioned", { entityType: "icebox", entityId: "i1" })
    expect(notificationHref(n)).toBe("/projects/p1/icebox?item=i1&tab=comments")
  })

  it("surveillance alerts link to the project dashboard", () => {
    expect(notificationHref(item("surveillance_critical", {}, { entityType: "sprint", entityId: "s1" }))).toBe("/projects/p1")
  })
})

describe("background AI report notifications", () => {
  it("ai_report_ready → title sentence and a deep link that opens the report", () => {
    const n = item("ai_report_ready", { reportId: "r/1", title: "📊 Progress report", kind: "progress_report" }, { entityType: "ai_report", entityId: "r/1" })
    expect(describeNotification(n, t, "en")).toEqual({
      text: "Your AI report “📊 Progress report” is ready",
      projectName: "Apollo",
      href: "/projects/p1?report=r%2F1",
    })
  })

  it("ai_report_failed → localized kind, links to the dashboard", () => {
    const n = item("ai_report_failed", { kind: "sprint_review", error: "timeout" }, { entityType: "ai_job", entityId: "j1" })
    const d = describeNotification(n, ja, "ja")
    expect(d.text).toBe(`AI レポート（${ja.aiJobKindSprintReview}）を生成できませんでした`)
    expect(d.href).toBe("/projects/p1")
  })

  it("improvement_check_due → kind + date, opens the item on the 改善成果ボード", () => {
    const n = item("improvement_check_due", { entityLabel: "段取り短縮", dueDate: "2026-11-02", kind: "1m" }, { entityType: "release", entityId: "r1" })
    const d = describeNotification(n, ja, "ja")
    expect(d.text).toContain("定着確認の期限です：段取り短縮（1 か月後・")
    expect(d.href).toBe("/projects/p1/releases?item=r1")
  })

  it("git_pipeline_failed → names the PBI and the MR, opens the PBI", () => {
    const n = item("git_pipeline_failed", { entityLabel: "ログイン", displayId: 12, mr: "34" }, { entityType: "pbi", entityId: "b1" })
    const d = describeNotification(n, ja, "ja")
    expect(d.text).toBe("「#12 ログイン」のマージリクエスト !34 のパイプラインが失敗しました")
    expect(d.href).toContain("b1")
  })
})

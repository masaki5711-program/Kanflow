import { describe, expect, it, vi } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { planBulkArchive, runSequential } from "../bulk-archive"
import { DORMANT_REMINDER_SNOOZE_DAYS, isReminderSnoozed, snoozeValue } from "../dormant-reminder"
import { groupByRole, roleGroupOf, roleGroupTitle } from "../role-groups"
import type { Project } from "../types"
import { resolveLayout } from "../use-project-list-prefs"

const DAY = 86_400_000
const NOW = new Date("2026-10-01T09:00:00Z")

function project(id: string, over: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    description: null,
    status: "active",
    projectType: "software",
    members: [],
    _count: { iceboxItems: 0, backlogItems: 0, sprints: 0 },
    progressPct: 0,
    lastActivityAt: new Date(NOW.getTime() - DAY).toISOString(),
    ...over,
  }
}

const dormant = (id: string, over: Partial<Project> = {}) =>
  project(id, { lastActivityAt: new Date(NOW.getTime() - 90 * DAY).toISOString(), ...over })

describe("resolveLayout (card / list view toggle persistence)", () => {
  it("uses a valid stored layout", () => {
    expect(resolveLayout("list", null)).toBe("list")
    expect(resolveLayout("card", "compact")).toBe("card")
  })

  it("defaults to cards and ignores garbage", () => {
    expect(resolveLayout(null, null)).toBe("card")
    expect(resolveLayout("table", null)).toBe("card")
  })

  it("maps the old compact density to the list layout when no layout was chosen", () => {
    expect(resolveLayout(null, "compact")).toBe("list")
    expect(resolveLayout(null, "comfortable")).toBe("card")
  })
})

describe("planBulkArchive", () => {
  it("keeps only dormant projects and splits them by the viewer's archive permission", () => {
    const plan = planBulkArchive(
      [project("fresh", { canUpdate: true }), dormant("mine", { canUpdate: true }), dormant("theirs", { canUpdate: false }), dormant("unknown")],
      NOW,
    )
    expect(plan.archivable.map((p) => p.id)).toEqual(["mine"])
    expect(plan.skipped.map((p) => p.id)).toEqual(["theirs", "unknown"])
  })

  it("never plans already archived projects", () => {
    const plan = planBulkArchive([dormant("old", { status: "archived", canUpdate: true })], NOW)
    expect(plan).toEqual({ archivable: [], skipped: [] })
  })
})

describe("runSequential", () => {
  it("runs one item at a time, reports progress and collects partial failures", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const progress = vi.fn()
    const task = async (n: number) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      if (n === 2) throw new Error("boom")
      if (n === 3) throw "plain"
    }
    const res = await runSequential([1, 2, 3, 4], task, progress)
    expect(maxInFlight).toBe(1)
    expect(res.succeeded).toEqual([1, 4])
    expect(res.failed.map((f) => [f.item, f.error.message])).toEqual([
      [2, "boom"],
      [3, "plain"],
    ])
    expect(progress.mock.calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ])
  })

  it("handles an empty batch", async () => {
    await expect(runSequential([], vi.fn())).resolves.toEqual({ succeeded: [], failed: [] })
  })
})

describe("dormant reminder snooze", () => {
  it("is not snoozed without a (valid) stored value", () => {
    expect(isReminderSnoozed(null, NOW)).toBe(false)
    expect(isReminderSnoozed("", NOW)).toBe(false)
    expect(isReminderSnoozed("tomorrow", NOW)).toBe(false)
  })

  it("stays hidden for 30 days after dismissal, then shows again", () => {
    const stored = snoozeValue(NOW)
    expect(Number(stored) - NOW.getTime()).toBe(DORMANT_REMINDER_SNOOZE_DAYS * DAY)
    expect(isReminderSnoozed(stored, new Date(NOW.getTime() + 29 * DAY))).toBe(true)
    expect(isReminderSnoozed(stored, new Date(NOW.getTime() + 30 * DAY))).toBe(false)
  })
})

describe("groupByRole", () => {
  const isFav = (p: Project) => p.isFavorite === true

  it("maps the viewer's project role to a section", () => {
    expect(roleGroupOf(project("a", { myRole: "po" }))).toBe("po")
    expect(roleGroupOf(project("a", { myRole: "sm" }))).toBe("sm")
    expect(roleGroupOf(project("a", { myRole: "dev" }))).toBe("member")
    expect(roleGroupOf(project("a", { myRole: null }))).toBe("viewer")
    expect(roleGroupOf(project("a"))).toBe("viewer")
  })

  it("puts favorites on top (not repeated), keeps input order and drops empty sections", () => {
    const groups = groupByRole(
      [
        project("dev1", { myRole: "dev" }),
        project("po1", { myRole: "po" }),
        project("fav", { myRole: "po", isFavorite: true }),
        project("view", { myRole: null }),
        project("po2", { myRole: "po" }),
      ],
      isFav,
    )
    expect(groups.map((g) => [g.key, g.items.map((p) => p.id)])).toEqual([
      ["favorites", ["fav"]],
      ["po", ["po1", "po2"]],
      ["member", ["dev1"]],
      ["viewer", ["view"]],
    ])
  })

  it("has no favorites section without favorites", () => {
    expect(groupByRole([project("s", { myRole: "sm" })], isFav).map((g) => g.key)).toEqual(["sm"])
  })

  it("titles sections with the project-role short names in every language", () => {
    const ja = getTranslations("ja")
    expect(roleGroupTitle("po", ja, "ja")).toBe("PO のプロジェクト")
    expect(roleGroupTitle("sm", ja, "ja")).toBe("SM のプロジェクト")
    expect(roleGroupTitle("member", ja, "ja")).toBe("メンバーとして参加")
    expect(roleGroupTitle("viewer", ja, "ja")).toBe("閲覧のみ（セクション管理・管理者）")
    expect(roleGroupTitle("po", getTranslations("en"), "en")).toBe("Projects where I'm PO")
    expect(roleGroupTitle("sm", getTranslations("id"), "id")).toBe("Proyek saya sebagai SM")
  })
})

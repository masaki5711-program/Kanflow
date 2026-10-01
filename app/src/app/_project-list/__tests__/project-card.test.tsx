import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import type { Project } from "../types"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { ProjectCard, ProjectRow } = await import("../project-card")

const SPRINT_REVIEW_TITLE = "🏁 スプリント完了レビュー / Tinjauan penyelesaian sprint: E2E-Sprint-A"

function project(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "IoT Platform Pilot Project : OEE (Overall Equipment Effectiveness)",
    description: null,
    status: "active",
    projectType: "software",
    members: [{ role: "po", user: { id: "u1", name: "Tanaka" } }],
    _count: { iceboxItems: 22, backlogItems: 37, sprints: 9, aiReports: 2 },
    progressPct: 0,
    aiReports: [{ id: "r1", title: SPRINT_REVIEW_TITLE }],
    ...over,
  }
}

function renderCard(p: Project, language: "ja" | "en" | "id" = "ja", now?: Date, Item = ProjectCard) {
  const noop = vi.fn()
  return renderWithProviders(
    <Item
      project={p}
      now={now}
      badges={[]}
      color={null}
      isFavorite={false}
      menuOpen={false}
      editing={false}
      onToggleFavorite={noop}
      onOpenOptions={noop}
      onContextMenu={noop}
      onStartEdit={noop}
      onCancelEdit={noop}
      onRename={noop}
    />,
    { language },
  )
}

const classesOf = (el: Element) => el.className.split(/\s+/)

describe("ProjectCard on phones (P-14 / S-17)", () => {
  it("may shrink below its content width inside the grid", () => {
    renderCard(project())
    const article = screen.getByRole("article")
    expect(classesOf(article)).toEqual(expect.arrayContaining(["min-w-0", "p-4", "sm:p-6"]))
  })

  it("stacks the counters under the title below sm and lets them wrap", () => {
    renderCard(project())
    const header = screen.getByTestId("project-card-header")
    expect(classesOf(header)).toEqual(expect.arrayContaining(["flex-col", "sm:flex-row"]))
    const stats = screen.getByTestId("project-card-stats")
    expect(classesOf(stats)).toEqual(expect.arrayContaining(["flex-wrap", "sm:flex-nowrap", "sm:shrink-0"]))
    expect(classesOf(stats)).not.toContain("shrink-0")
  })

  it("breaks long unspaced project names instead of widening the card", () => {
    renderCard(project({ name: "X".repeat(120) }))
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("[overflow-wrap:anywhere]")
  })
})

describe("ProjectCard AI report badge tooltip (S-18)", () => {
  it.each([
    ["id", "Tinjauan penyelesaian sprint: E2E-Sprint-A"],
    ["ja", "🏁 スプリント完了レビュー: E2E-Sprint-A"],
  ] as const)("shows the %s side of a bilingual report title", (language, expected) => {
    renderCard(project(), language)
    expect(screen.getByTitle(expected)).toBeInTheDocument()
    expect(screen.queryByTitle(SPRINT_REVIEW_TITLE)).toBeNull()
  })

  it("localizes a progress report title for an Indonesian viewer", () => {
    renderCard(project({ aiReports: [{ id: "r2", title: "📊 進捗レポート" }] }), "id")
    expect(screen.getByTitle("📊 Laporan progres")).toBeInTheDocument()
  })

  it("falls back to the generic label when there is no report title", () => {
    renderCard(project({ aiReports: [] }), "id")
    expect(screen.getByTitle(tr("id").aiReportsTitle)).toBeInTheDocument()
  })
})

describe("ProjectCard dates and dormancy", () => {
  const NOW = new Date(2026, 9, 1, 12, 0)
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

  it("shows compact created / last-updated dates with the full datetime in the tooltip (ja)", () => {
    const t = tr("ja")
    renderCard(project({ createdAt: new Date(2026, 3, 12, 9, 30), updatedAt: daysAgo(10), lastActivityAt: daysAgo(3) }), "ja", NOW)
    const dates = screen.getByTestId("project-dates")
    expect(dates).toHaveTextContent("作成 2026/4/12 · 更新 3 日前")
    expect(dates.getAttribute("title")).toContain("作成日時: 2026/4/12 09:30")
    expect(dates.getAttribute("title")).toContain(t.projectDateUpdatedFull.replace("{date}", ""))
    expect(screen.queryByTestId("project-dormant-badge")).toBeNull()
  })

  it.each([
    ["en", "Created Apr 12, 2026", "Updated 3 days ago"],
    ["id", "Dibuat 12 Apr 2026", "Diperbarui 3 hari yang lalu"],
  ] as const)("localizes the dates in %s", (language, created, updated) => {
    renderCard(project({ createdAt: new Date(2026, 3, 12), lastActivityAt: daysAgo(3) }), language, NOW)
    const dates = screen.getByTestId("project-dates")
    expect(dates).toHaveTextContent(created)
    expect(dates).toHaveTextContent(updated)
  })

  it("adds the archive date for archived projects and never flags them dormant", () => {
    renderCard(project({ status: "archived", createdAt: new Date(2025, 0, 5), lastActivityAt: daysAgo(400), archivedAt: new Date(2026, 8, 30) }), "ja", NOW)
    expect(screen.getByTestId("project-dates")).toHaveTextContent("アーカイブ 2026/9/30")
    expect(screen.queryByTestId("project-dormant-badge")).toBeNull()
  })

  it("shows a subtle dormant badge with an archive hint after 60 idle days", () => {
    const t = tr("ja")
    renderCard(project({ lastActivityAt: daysAgo(75) }), "ja", NOW)
    const badge = screen.getByTestId("project-dormant-badge")
    expect(badge).toHaveTextContent("休眠 75日")
    expect(badge).toHaveAttribute("title", t.projectDormantHint.replace("{days}", "75"))
    expect(badge).toHaveAccessibleName("75日間更新がありません — アーカイブを検討してください")
  })

  it.each([
    ["en", "Dormant 61d"],
    ["id", "Tidak aktif 61 hari"],
  ] as const)("localizes the dormant badge in %s", (language, text) => {
    renderCard(project({ lastActivityAt: daysAgo(61) }), language, NOW)
    expect(screen.getByTestId("project-dormant-badge")).toHaveTextContent(text)
  })

  it("renders no dates when the project has none", () => {
    renderCard(project(), "ja", NOW)
    expect(screen.queryByTestId("project-dates")).toBeNull()
  })

  it("compact rows show only the last update and the dormant badge", () => {
    renderCard(project({ createdAt: new Date(2026, 0, 1), lastActivityAt: daysAgo(90) }), "ja", NOW, ProjectRow)
    const dates = screen.getByTestId("project-dates")
    expect(dates).not.toHaveTextContent("作成")
    expect(dates).toHaveTextContent("更新")
    expect(screen.getByTestId("project-dormant-badge")).toHaveTextContent("休眠 90日")
  })
})

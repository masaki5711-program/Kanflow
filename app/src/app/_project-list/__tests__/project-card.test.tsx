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

const { ProjectCard } = await import("../project-card")

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

function renderCard(p: Project, language: "ja" | "en" | "id" = "ja") {
  const noop = vi.fn()
  return renderWithProviders(
    <ProjectCard
      project={p}
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

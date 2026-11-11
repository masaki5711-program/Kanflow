import { describe, expect, it } from "vitest"
import { screen, within } from "@testing-library/react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { PbiBoardsSection } from "./pbi-boards-section"

const t = tr("ja")

describe("PBI detail: the White Boards that stand for it (B7, synthetic)", () => {
  it("lists the boards with a link onto the shape, and draws the sheet around it", async () => {
    stubFetch([
      { match: "/api/projects/p1/backlog/pbi-1/boards", respond: () => jsonResponse({ links: [{ boardId: "b1", boardTitle: "構成図（合成）", sheetId: "s1", sheetName: "全体図", elementId: "el-1" }] }) },
      { match: "/api/projects/p1/boards/b1/sheets/s1/elements", respond: () => jsonResponse({ rev: 1, full: true, elements: [{ id: "el-1", version: 1, deleted: false, data: { type: "sticky", x: 0, y: 0, w: 100, h: 100, z: 1, text: "合成", fill: "amber", stroke: "ink" } }] }) },
    ])
    renderWithProviders(<PbiBoardsSection projectId="p1" pbiId="pbi-1" />)
    const section = await screen.findByRole("region", { name: t.wbLinkedBoardsTitle })
    const link = within(section).getByRole("link", { name: /構成図（合成）/ })
    expect(link).toHaveAttribute("href", "/projects/p1/boards/b1?sheet=s1&element=el-1")
    expect(await within(section).findByTestId("sheet-preview")).toBeInTheDocument()
    expect(section.querySelector("[data-preview-focus]")).toBeInTheDocument()
  })

  it("shows nothing without boards or without access", async () => {
    stubFetch([{ match: "/api/projects/p1/backlog/pbi-2/boards", respond: () => jsonResponse({ error: "Forbidden" }, 403) }])
    const { container } = renderWithProviders(<PbiBoardsSection projectId="p1" pbiId="pbi-2" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector("[data-testid=pbi-boards]")).toBeNull()
  })
})

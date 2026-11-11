import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { SheetTabs } from "../sheet-tabs"

const t = tr("ja")
const SHEETS = [
  { id: "s1", name: "全体図", rev: 0 },
  { id: "s2", name: "詳細", rev: 0 },
  { id: "s3", name: "メモ", rev: 0 },
]

function setup(props: Partial<Parameters<typeof SheetTabs>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
  }
  renderWithProviders(
    <SheetTabs sheets={SHEETS} activeId="s2" tabId={(id) => `tab-${id}`} panelId="panel" readOnly={false} canAdd {...handlers} {...props} />,
  )
  return handlers
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, sheetName: string) {
  await user.click(screen.getByRole("button", { name: t.wbActionsFor.replace("{name}", sheetName) }))
  return screen.getAllByRole("menuitem").map((item) => item.textContent)
}

describe("SheetTabs", () => {
  it("is a tab list: one selected tab, which is the only one in the tab order", () => {
    setup()
    const list = screen.getByRole("tablist", { name: t.wbSheetsLabel })
    const tabs = within(list).getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["全体図", "詳細", "メモ"])
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"])
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1])
    expect(tabs[1]).toHaveAttribute("aria-controls", "panel")
    expect(tabs[1]).toHaveAttribute("id", "tab-s2")
  })

  it("arrow keys, Home and End move the focus without opening a sheet; Enter opens it", async () => {
    const user = userEvent.setup()
    const handlers = setup()
    const [first, second, third] = screen.getAllByRole("tab")
    second.focus()
    await user.keyboard("{ArrowRight}")
    expect(third).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(first).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(third).toHaveFocus()
    await user.keyboard("{Home}")
    expect(first).toHaveFocus()
    await user.keyboard("{End}")
    expect(third).toHaveFocus()
    expect(handlers.onSelect).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(handlers.onSelect).toHaveBeenCalledWith("s3")
  })

  it("the menu of the open sheet renames, duplicates, moves and deletes it", async () => {
    const user = userEvent.setup()
    const handlers = setup()
    expect(await openMenu(user, "詳細")).toEqual([t.wbRename, t.wbSheetDuplicate, t.wbSheetMoveLeft, t.wbSheetMoveRight, t.wbSheetDelete])
    await user.click(screen.getByRole("menuitem", { name: t.wbSheetMoveLeft }))
    expect(handlers.onMove).toHaveBeenCalledWith(SHEETS[1], -1)
    await openMenu(user, "詳細")
    await user.click(screen.getByRole("menuitem", { name: t.wbSheetMoveRight }))
    expect(handlers.onMove).toHaveBeenCalledWith(SHEETS[1], 1)
    await openMenu(user, "詳細")
    await user.click(screen.getByRole("menuitem", { name: t.wbRename }))
    expect(handlers.onRename).toHaveBeenCalledWith(SHEETS[1])
    await openMenu(user, "詳細")
    await user.click(screen.getByRole("menuitem", { name: t.wbSheetDuplicate }))
    expect(handlers.onDuplicate).toHaveBeenCalledWith(SHEETS[1])
    await openMenu(user, "詳細")
    await user.click(screen.getByRole("menuitem", { name: t.wbSheetDelete }))
    expect(handlers.onDelete).toHaveBeenCalledWith(SHEETS[1])
  })

  it("offers only the moves that are possible, and no delete for the last sheet", async () => {
    const user = userEvent.setup()
    setup({ activeId: "s1" })
    expect(await openMenu(user, "全体図")).toEqual([t.wbRename, t.wbSheetDuplicate, t.wbSheetMoveRight, t.wbSheetDelete])
  })

  it("a board with one sheet cannot lose it", async () => {
    const user = userEvent.setup()
    setup({ sheets: [SHEETS[0]], activeId: "s1" })
    expect(await openMenu(user, "全体図")).toEqual([t.wbRename, t.wbSheetDuplicate])
  })

  it("at the sheet limit nothing can be added or duplicated", async () => {
    const user = userEvent.setup()
    setup({ canAdd: false })
    expect(screen.getByRole("button", { name: t.wbSheetAdd })).toBeDisabled()
    expect(await openMenu(user, "詳細")).not.toContain(t.wbSheetDuplicate)
  })

  it("adds a sheet with the add button and renames with a double click", async () => {
    const user = userEvent.setup()
    const handlers = setup()
    await user.click(screen.getByRole("button", { name: t.wbSheetAdd }))
    expect(handlers.onAdd).toHaveBeenCalledTimes(1)
    await user.dblClick(screen.getByRole("tab", { name: "メモ" }))
    expect(handlers.onRename).toHaveBeenCalledWith(SHEETS[2])
  })

  it("read only: the tabs switch sheets, nothing else", async () => {
    const user = userEvent.setup()
    const handlers = setup({ readOnly: true })
    expect(screen.queryByRole("button", { name: t.wbSheetAdd })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.wbActionsFor.replace("{name}", "詳細") })).not.toBeInTheDocument()
    await user.dblClick(screen.getByRole("tab", { name: "全体図" }))
    expect(handlers.onRename).not.toHaveBeenCalled()
    expect(handlers.onSelect).toHaveBeenCalledWith("s1")
  })
})

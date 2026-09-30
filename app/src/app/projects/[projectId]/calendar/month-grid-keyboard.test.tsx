import { describe, expect, it, vi } from "vitest"
import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders } from "./__tests__/render"
import { buildCalendarDays, fmt, toDateStr } from "./calendar-types"
import MonthGrid from "./month-grid"
import type { SprintPhase } from "./use-calendar-data"
import { defaultFocusDay, gridKeyTarget } from "./use-month-grid-focus"

const t = getTranslations("ja")
const TODAY = new Date(2026, 9, 1)
const addLabel = (d: Date) =>
  fmt(t.calendarAddOnDate, { date: d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }) })

const sprint = {
  id: "s1",
  sprintName: "Sprint A",
  startDate: "2026-09-21",
  endDate: "2026-10-09",
  status: "active",
  progress: 40,
} as unknown as SprintPhase

function Harness({ onSprint = vi.fn() }: { onSprint?: (id: string) => void }) {
  const [month, setMonth] = useState({ y: 2026, m: 9 })
  return (
    <MonthGrid
      calendarDays={buildCalendarDays(month.y, month.m)}
      currentYear={month.y}
      currentMonth={month.m}
      label={`${month.y}年${month.m + 1}月`}
      onShowMonth={(d) => setMonth({ y: d.getFullYear(), m: d.getMonth() })}
      today={TODAY}
      locale="ja-JP"
      events={[]}
      sprintPhases={[sprint]}
      taskDeadlinesByDate={{}}
      expandedDay={null}
      dragStart={null}
      isMultiDayDrag={false}
      isDayInDragRange={() => false}
      onDayMouseDown={vi.fn()}
      onDayMouseEnter={vi.fn()}
      onDayClick={vi.fn()}
      onEventClick={vi.fn()}
      onSprintBarClick={onSprint}
      onDeadlineBadgeClick={vi.fn()}
      onExpandDay={vi.fn()}
    />
  )
}

describe("gridKeyTarget", () => {
  const d = new Date(2026, 0, 31) // Sat
  it("moves by day / week / week edge / month (clamped) / year", () => {
    expect(toDateStr(gridKeyTarget("ArrowRight", d)!)).toBe("2026-02-01")
    expect(toDateStr(gridKeyTarget("ArrowLeft", d)!)).toBe("2026-01-30")
    expect(toDateStr(gridKeyTarget("ArrowDown", d)!)).toBe("2026-02-07")
    expect(toDateStr(gridKeyTarget("ArrowUp", d)!)).toBe("2026-01-24")
    expect(toDateStr(gridKeyTarget("Home", d)!)).toBe("2026-01-25")
    expect(toDateStr(gridKeyTarget("End", d)!)).toBe("2026-01-31")
    expect(toDateStr(gridKeyTarget("PageDown", d)!)).toBe("2026-02-28")
    expect(toDateStr(gridKeyTarget("PageUp", d)!)).toBe("2025-12-31")
    expect(toDateStr(gridKeyTarget("PageDown", d, true)!)).toBe("2027-01-31")
    expect(gridKeyTarget("Enter", d)).toBeNull()
  })

  it("default Tab stop is today in its month, else the 1st", () => {
    expect(defaultFocusDay(2026, 9, TODAY)).toBe("2026-10-01")
    expect(defaultFocusDay(2026, 10, TODAY)).toBe("2026-11-01")
  })
})

describe("MonthGrid keyboard (F-17)", () => {
  it("is a grid with a single Tab stop; arrows / Home / End / PageDown move the focus", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness />)
    const grid = screen.getByRole("grid", { name: "2026年10月" })
    expect(within(grid).getAllByRole("row")).toHaveLength(6)
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(42)
    const tabbable = Array.from(grid.querySelectorAll<HTMLElement>("[data-cal-day]")).filter((b) => b.tabIndex === 0)
    expect(tabbable.map((b) => b.dataset.calDay)).toEqual(["2026-10-01"])

    act(() => screen.getByRole("button", { name: addLabel(new Date(2026, 9, 1)) }).focus())
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toHaveAccessibleName(addLabel(new Date(2026, 9, 2)))
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toHaveAccessibleName(addLabel(new Date(2026, 9, 9)))
    await user.keyboard("{End}")
    expect(document.activeElement).toHaveAccessibleName(addLabel(new Date(2026, 9, 10)))
    await user.keyboard("{Home}")
    expect(document.activeElement).toHaveAccessibleName(addLabel(new Date(2026, 9, 4)))
    expect(screen.getByRole("button", { name: addLabel(new Date(2026, 9, 4)) })).toHaveAttribute("tabindex", "0")
    await user.keyboard("{PageDown}")
    expect(screen.getByRole("grid", { name: "2026年11月" })).toBeInTheDocument()
    expect(document.activeElement).toHaveAccessibleName(addLabel(new Date(2026, 10, 4)))
    // leaving the shown weeks switches the month
    await user.keyboard("{ArrowUp}{ArrowUp}")
    expect(screen.getByRole("grid", { name: "2026年10月" })).toBeInTheDocument()
    expect(document.activeElement).toHaveAccessibleName(addLabel(new Date(2026, 9, 21)))
  })

  it("a sprint bar is one focusable button, not one per day", async () => {
    const onSprint = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Harness onSprint={onSprint} />)
    const label = fmt(t.calendarSprintProgress, { sprint: "Sprint A", progress: 40 })
    const bars = screen.getAllByRole("button", { name: label })
    expect(bars).toHaveLength(1)
    // the grid starts on 9/27 (Sun), after the sprint started: that first day holds the focusable segment
    expect(bars[0].closest("[role=gridcell]")?.querySelector("[data-cal-day]")).toHaveAttribute("data-cal-day", "2026-09-27")
    const segments = document.querySelectorAll(`button[title="${label}"]`)
    expect(segments.length).toBeGreaterThan(10)
    await user.click(segments[5] as HTMLElement)
    expect(onSprint).toHaveBeenCalledWith("s1")
  })
})

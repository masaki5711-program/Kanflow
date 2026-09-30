import { describe, expect, it } from "vitest"
import {
  buildCalendarDays,
  datePart,
  emptyForm,
  eventCoversDay,
  eventToForm,
  fmt,
  getInitials,
  getWeekStart,
  i18nOf,
  isSameDay,
  parseLocalDate,
  toDateStr,
  toEventBody,
  type CalendarEvent,
} from "./calendar-types"

const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  title: "Demo",
  description: null,
  date: "2026-09-10T00:00:00.000Z",
  endDate: null,
  color: "blue",
  sprintId: null,
  sprint: null,
  ...over,
})

describe("calendar-types helpers", () => {
  it("formats and parses local dates without timezone drift", () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe("2026-01-05")
    const d = parseLocalDate("2026-03-09T12:00:00Z")
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 9])
  })

  it("compares calendar days ignoring time", () => {
    expect(isSameDay(new Date(2026, 1, 1, 1), new Date(2026, 1, 1, 23))).toBe(true)
    expect(isSameDay(new Date(2026, 1, 1), new Date(2026, 1, 2))).toBe(false)
  })

  it("builds a 6-week grid starting on the Sunday before the 1st", () => {
    const days = buildCalendarDays(2026, 8) // Sep 2026 — 1st is a Tuesday
    expect(days).toHaveLength(42)
    expect(toDateStr(days[0])).toBe("2026-08-30")
    expect(days[0].getDay()).toBe(0)
    expect(toDateStr(days[2])).toBe("2026-09-01")
  })

  it("returns the Sunday that starts the week", () => {
    expect(toDateStr(getWeekStart(new Date(2026, 8, 17)))).toBe("2026-09-13")
  })

  it("derives initials from name or email", () => {
    expect(getInitials("taro yamada", "x@y")).toBe("TY")
    expect(getInitials("hanako", "x@y")).toBe("HA")
    expect(getInitials(null, "dev@example.com")).toBe("DE")
  })

  it("checks whether an event covers a day (single and multi-day)", () => {
    expect(datePart("2026-09-10T00:00:00Z")).toBe("2026-09-10")
    expect(eventCoversDay(ev(), "2026-09-10")).toBe(true)
    expect(eventCoversDay(ev(), "2026-09-11")).toBe(false)
    const multi = ev({ endDate: "2026-09-12" })
    expect(eventCoversDay(multi, "2026-09-11")).toBe(true)
    expect(eventCoversDay(multi, "2026-09-13")).toBe(false)
  })

  it("reads i18n and fills templates, leaving unknown placeholders", () => {
    expect(i18nOf(null)).toBeUndefined()
    expect(i18nOf({ i18n: { a: 1 } })).toEqual({ a: 1 })
    expect(fmt("{a} and {b}", { a: 1 })).toBe("1 and {b}")
  })

  it("converts a form to a trimmed API body omitting empty optionals", () => {
    expect(toEventBody({ ...emptyForm, title: "  x ", date: "2026-09-01" })).toEqual({
      title: "x",
      description: undefined,
      date: "2026-09-01",
      endDate: undefined,
      color: "blue",
      sprintId: undefined,
    })
    expect(
      toEventBody({ title: "t", description: " d ", date: "a", endDate: "b", color: "red", sprintId: "s" }),
    ).toMatchObject({ description: "d", endDate: "b", sprintId: "s" })
  })

  it("maps an event into form state", () => {
    expect(eventToForm(ev({ description: "d", endDate: "2026-09-12T00:00:00Z", sprintId: "s1" }))).toEqual({
      title: "Demo",
      description: "d",
      date: "2026-09-10",
      endDate: "2026-09-12",
      color: "blue",
      sprintId: "s1",
    })
    expect(eventToForm(ev())).toMatchObject({ description: "", endDate: "", sprintId: "" })
  })
})

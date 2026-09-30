import { describe, expect, it } from "vitest"
import {
  COLUMN_WIDTH,
  MIN_TIMELINE_WIDTH,
  NAME_COLUMN_WIDTH,
  NAME_COLUMN_WIDTH_COMPACT,
  NAME_WIDTH_MAX,
  NAME_WIDTH_MIN,
  PHONE_TIMELINE_PEEK,
  columnsWidth,
  defaultNameWidth,
  fitColumns,
  gridWidth,
  nameWidthBounds,
  phoneNamesWidth,
  resolveNameWidth,
  visibleColumns,
} from "../lib/grid-layout"
import { DEFAULT_COLUMNS, PLAN_COLUMNS, TABLET_COLUMNS, shownColumns } from "../lib/prefs"

describe("grid layout", () => {
  it("column visibility (canonical order) and grid width", () => {
    expect(visibleColumns(["status", "period", "owner"], false, PLAN_COLUMNS)).toEqual(["period", "owner", "status"])
    expect(visibleColumns(DEFAULT_COLUMNS, true, PLAN_COLUMNS)).toEqual([])
    expect(gridWidth([], 180)).toBe(180)
    expect(gridWidth(["start", "end"], 200)).toBe(200 + COLUMN_WIDTH.start + COLUMN_WIDTH.end)
  })

  it("F-01: on desktop the default grid (240px name + period + progress) leaves most of the chart to the timeline", () => {
    const chart = 1136 // chart box at a 1440px window
    const grid = gridWidth(DEFAULT_COLUMNS, resolveNameWidth(null, { compact: false, containerWidth: chart, columns: DEFAULT_COLUMNS }))
    expect(grid).toBe(NAME_COLUMN_WIDTH + columnsWidth(DEFAULT_COLUMNS))
    expect(chart - grid).toBeGreaterThan(chart * 0.55)
    expect(defaultNameWidth(0, DEFAULT_COLUMNS, { compact: false, tablet: true })).toBe(NAME_COLUMN_WIDTH)
    expect(defaultNameWidth(343, [], { compact: true, tablet: true })).toBe(NAME_COLUMN_WIDTH_COMPACT)
  })

  it("N-08: tablets default to name + progress with a 40 / 60 split", () => {
    expect(shownColumns({ columns: null }, true)).toEqual(TABLET_COLUMNS)
    expect(shownColumns({ columns: null }, false)).toEqual(DEFAULT_COLUMNS)
    expect(shownColumns({ columns: ["owner"] }, true)).toEqual(["owner"])
    const chart = 720 // 768px window
    const name = resolveNameWidth(null, { compact: false, tablet: true, containerWidth: chart, columns: TABLET_COLUMNS })
    const grid = gridWidth(TABLET_COLUMNS, name)
    expect(grid).toBe(Math.round(chart * 0.4))
    expect(chart - grid).toBeGreaterThanOrEqual(chart * 0.6)
  })

  it("name width: the splitter value is clamped so names stay legible and the timeline keeps its minimum", () => {
    const cols = DEFAULT_COLUMNS
    expect(NAME_WIDTH_MIN).toBe(160)
    expect(resolveNameWidth(null, { compact: true, containerWidth: 0, columns: [] })).toBe(NAME_COLUMN_WIDTH_COMPACT)
    expect(resolveNameWidth(10, { compact: false, containerWidth: 0, columns: cols })).toBe(NAME_WIDTH_MIN)
    expect(resolveNameWidth(5000, { compact: false, containerWidth: 0, columns: cols })).toBe(NAME_WIDTH_MAX)
    expect(resolveNameWidth(600, { compact: false, containerWidth: 900, columns: cols })).toBe(900 - columnsWidth(cols) - MIN_TIMELINE_WIDTH)
    expect(nameWidthBounds(343, [])).toEqual({ min: NAME_WIDTH_MIN, max: 343 - Math.round(343 * 0.4) })
    expect(resolveNameWidth(null, { compact: true, containerWidth: 343, columns: [] })).toBe(NAME_COLUMN_WIDTH_COMPACT)
    expect(nameWidthBounds(180, [])).toEqual({ min: NAME_WIDTH_MIN, max: NAME_WIDTH_MIN })
    expect(nameWidthBounds(2000, cols).max).toBe(NAME_WIDTH_MAX)
  })

  it("N-03: with every column chosen, low-priority columns give way so the name keeps ≥ 160px", () => {
    // 1280px window with the sidebar: every column fits next to a 160px name
    expect(fitColumns(PLAN_COLUMNS, 1230)).toEqual({ columns: [...PLAN_COLUMNS], hidden: [] })
    // a narrower box drops duration, end, start … first; period / progress stay longest
    const narrow = fitColumns(PLAN_COLUMNS, 900)
    expect(narrow).toEqual({ columns: ["period", "progress", "owner", "status"], hidden: ["start", "end", "duration"] })
    const room = 900 - MIN_TIMELINE_WIDTH - NAME_WIDTH_MIN
    expect(columnsWidth(narrow.columns)).toBeLessThanOrEqual(room)
    // the splitter can still widen the name column up to what is left
    const bounds = nameWidthBounds(900, narrow.columns)
    expect(bounds.max).toBeGreaterThanOrEqual(NAME_WIDTH_MIN)
    expect(bounds.max + columnsWidth(narrow.columns) + MIN_TIMELINE_WIDTH).toBeLessThanOrEqual(900)
    // not measured yet: nothing is hidden
    expect(fitColumns(PLAN_COLUMNS, 0).hidden).toEqual([])
  })

  it("F-07: phone 'names first' leaves only a timeline peek", () => {
    expect(phoneNamesWidth(343)).toBe(343 - PHONE_TIMELINE_PEEK)
    expect(phoneNamesWidth(343)).toBeGreaterThan(NAME_COLUMN_WIDTH_COMPACT + 90)
    expect(phoneNamesWidth(100)).toBe(NAME_WIDTH_MIN)
  })
})

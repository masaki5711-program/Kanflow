"use client"

import { useMemo } from "react"
import type { Language } from "@/lib/i18n"
import { columnsWidth, fitColumns, gridWidth, nameWidthBounds, phoneNamesWidth, resolveNameWidth, visibleColumns } from "../lib/grid-layout"
import type { PlanItem, Ymd } from "../lib/plan-types"
import { DEFAULT_COLUMNS, PLAN_COLUMNS, type PlanColumn, type PlanPrefs } from "../lib/prefs"
import { PRINT_NAME_MAX, PRINT_WIDTH, fullPlanRange, printLayout } from "../lib/print"
import { ZOOM_DAY_WIDTH, buildScale, chartRange, type ChartRange, type PlanZoom, type TimeScale } from "../lib/scale"
import type { PrintRequest } from "./use-plan-print"

export interface PlanLayout {
  columns: PlanColumn[]
  nameWidth: number
  gridWidth: number
  gridCollapsed: boolean
  range: ChartRange
  dayWidth: number
  scale: TimeScale
  /** Splitter limits for the name column. */
  nameBounds: { min: number; max: number }
  /** Chosen columns left out because the chart box is too narrow (column menu hint). */
  hiddenColumns: PlanColumn[]
  /** Phone "names first" layout (the name column is fixed; no splitter). */
  phoneNames: boolean
  printing: boolean
}

interface Input {
  items: readonly PlanItem[]
  today: Ymd
  zoom: PlanZoom
  language: Language
  prefs: PlanPrefs
  shown: readonly PlanColumn[]
  isNarrow: boolean
  /** Below the lg breakpoint (the default grid keeps a 40 / 60 split). */
  isTablet: boolean
  /** Below the sm breakpoint (the names-first / timeline-first toggle applies). */
  isPhone: boolean
  /** clientWidth of the chart box (0 before the first measure). */
  containerWidth: number
  print: PrintRequest | null
}

/** Grid columns that fit a printed page next to a readable timeline. */
function printColumns(columns: readonly PlanColumn[], nameWidth: number): PlanColumn[] {
  if (nameWidth + columnsWidth(columns) <= PRINT_WIDTH * 0.45) return [...columns]
  return columns.filter((c) => DEFAULT_COLUMNS.includes(c))
}

/**
 * Geometry of the chart: grid columns and widths (viewer prefs, splitter,
 * narrow screens) and the time range / day width — the zoom's on screen, a
 * page-fitted one while printing.
 */
export function usePlanLayout({ items, today, zoom, language, prefs, shown, isNarrow, isTablet, isPhone, containerWidth, print }: Input): PlanLayout {
  const gridCollapsed = prefs.gridCollapsed ?? isNarrow
  const fitted = useMemo(() => fitColumns(visibleColumns(shown, gridCollapsed, PLAN_COLUMNS), containerWidth), [shown, gridCollapsed, containerWidth])
  const screenColumns = fitted.columns
  const phoneNames = isPhone && prefs.phoneLayout === "names" && containerWidth > 0
  const nameWidth = phoneNames
    ? phoneNamesWidth(containerWidth - columnsWidth(screenColumns))
    : resolveNameWidth(prefs.nameWidth, { compact: isNarrow, tablet: isTablet, containerWidth, columns: screenColumns })
  const screenRange = useMemo(() => chartRange(items, today, zoom), [items, today, zoom])

  return useMemo(() => {
    const nameBounds = nameWidthBounds(containerWidth, screenColumns)
    if (!print) {
      const dayWidth = ZOOM_DAY_WIDTH[zoom]
      return {
        columns: screenColumns,
        nameWidth,
        gridWidth: gridWidth(screenColumns, nameWidth),
        gridCollapsed,
        range: screenRange,
        dayWidth,
        scale: buildScale(screenRange, zoom, language),
        nameBounds,
        hiddenColumns: fitted.hidden,
        phoneNames,
        printing: false,
      }
    }
    const printName = Math.min(nameWidth, PRINT_NAME_MAX)
    const columns = printColumns(screenColumns, printName)
    const gw = gridWidth(columns, printName)
    const base = print.scope === "visible" && print.visible ? print.visible : fullPlanRange(items, today)
    const page = printLayout(base, gw, print.scope)
    return {
      columns,
      nameWidth: printName,
      gridWidth: gw,
      gridCollapsed,
      range: page.range,
      dayWidth: page.dayWidth,
      scale: buildScale(page.range, page.zoom, language, page.dayWidth),
      nameBounds,
      hiddenColumns: [],
      phoneNames: false,
      printing: true,
    }
  }, [containerWidth, fitted.hidden, gridCollapsed, items, language, nameWidth, phoneNames, print, screenColumns, screenRange, today, zoom])
}

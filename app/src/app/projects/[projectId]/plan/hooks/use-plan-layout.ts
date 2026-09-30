"use client"

import { useMemo } from "react"
import type { Language } from "@/lib/i18n"
import { columnsWidth, gridWidth, nameWidthBounds, resolveNameWidth, visibleColumns } from "../lib/filter"
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
export function usePlanLayout({ items, today, zoom, language, prefs, shown, isNarrow, containerWidth, print }: Input): PlanLayout {
  const gridCollapsed = prefs.gridCollapsed ?? isNarrow
  const screenColumns = useMemo(() => visibleColumns(shown, gridCollapsed, PLAN_COLUMNS), [shown, gridCollapsed])
  const nameWidth = resolveNameWidth(prefs.nameWidth, { compact: isNarrow, containerWidth, columns: screenColumns })
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
        printing: false,
      }
    }
    const printName = Math.min(nameWidth, PRINT_NAME_MAX)
    const columns = printColumns(screenColumns, printName)
    const gw = gridWidth(columns, printName)
    const base = print.scope === "visible" && print.visible ? print.visible : fullPlanRange(items, today)
    const fitted = printLayout(base, gw, print.scope)
    return {
      columns,
      nameWidth: printName,
      gridWidth: gw,
      gridCollapsed,
      range: fitted.range,
      dayWidth: fitted.dayWidth,
      scale: buildScale(fitted.range, fitted.zoom, language, fitted.dayWidth),
      nameBounds,
      printing: true,
    }
  }, [containerWidth, gridCollapsed, items, language, nameWidth, print, screenColumns, screenRange, today, zoom])
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { FileBarChart } from "lucide-react"
import { EmptyState, SkeletonTable, PageHeader, buttonClasses } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { DAY_WIDTH_MAP, type ZoomLevel } from "./gantt-types"
import { buildDateColumns, daysBetween, isRealTask, localeOf, startOfDay } from "./gantt-utils"
import { useGanttData, useGanttText } from "./use-gantt-data"
import { GanttToolbar } from "./gantt-toolbar"
import { GanttLeftPanel } from "./gantt-left-panel"
import { GanttTimelineHeader } from "./gantt-timeline-header"
import { GanttTimelineBody } from "./gantt-timeline-body"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

export default function GanttPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.ganttTitle)
  const text = useGanttText()
  const { sprints, events, rows, isLoading, isExpanded, toggle, timelineStart, totalDays } = useGanttData(projectId)

  const [zoom, setZoom] = useState<ZoomLevel>("2weeks")
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const dayWidth = DAY_WIDTH_MAP[zoom]

  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const scrolledRef = useRef(false)

  const syncScroll = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (syncingRef.current || !from || !to) return
    syncingRef.current = true
    to.scrollTop = from.scrollTop
    syncingRef.current = false
  }, [])
  const handleLeftScroll = useCallback(() => syncScroll(leftRef.current, rightRef.current), [syncScroll])
  const handleRightScroll = useCallback(() => syncScroll(rightRef.current, leftRef.current), [syncScroll])

  const scrollToToday = useCallback(() => {
    const el = rightRef.current
    if (!el || sprints.length === 0) return
    const offset = daysBetween(timelineStart, startOfDay(new Date()))
    el.scrollTo({ left: offset * dayWidth - el.clientWidth / 2, behavior: "smooth" })
  }, [sprints.length, timelineStart, dayWidth])

  // Auto-scroll to today once, after the first load.
  useEffect(() => {
    if (isLoading || sprints.length === 0 || scrolledRef.current) return
    scrolledRef.current = true
    scrollToToday()
  }, [isLoading, sprints.length, scrollToToday])

  const columns = useMemo(
    () => buildDateColumns(timelineStart, totalDays, t.ganttWeekdays, localeOf(language)),
    [timelineStart, totalDays, t.ganttWeekdays, language],
  )

  const { totalTasks, completionPct } = useMemo(() => {
    const real = sprints.flatMap((s) => s.items.filter(isRealTask))
    const done = real.filter((i) => i.status === "done").length
    return { totalTasks: real.length, completionPct: real.length > 0 ? Math.round((done / real.length) * 100) : 0 }
  }, [sprints])

  const header = <PageHeader title={t.ganttTitle} className="mb-4" />

  if (isLoading) {
    return (
      <div>
        {header}
        <SkeletonTable rows={8} columns={3} label={t.loading} />
      </div>
    )
  }

  if (sprints.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<FileBarChart className="h-6 w-6" aria-hidden="true" />}
          title={t.ganttNoData}
          description={t.ganttNoDataHint}
          action={
            <Link href={`/projects/${projectId}/sprints`} className={buttonClasses({ variant: "primary" })}>
              {t.ganttGoToSprints}
            </Link>
          }
        />
      </div>
    )
  }

  const todayTime = startOfDay(new Date()).getTime()

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <GanttToolbar
          zoom={zoom}
          onZoomChange={setZoom}
          onScrollToToday={scrollToToday}
          sprintCount={sprints.length}
          taskCount={totalTasks}
          completionPct={completionPct}
        />

        <div className="flex flex-1 overflow-hidden">
          <GanttLeftPanel
            rows={rows}
            text={text}
            isExpanded={isExpanded}
            onToggle={toggle}
            hoveredRow={hoveredRow}
            onHover={setHoveredRow}
            scrollRef={leftRef}
            onScroll={handleLeftScroll}
          />

          <section
            ref={rightRef}
            onScroll={handleRightScroll}
            aria-label={t.ganttTimelineLabel}
            className="flex-1 overflow-auto"
          >
            <div style={{ width: totalDays * dayWidth }}>
              <GanttTimelineHeader
                columns={columns}
                events={events}
                dayWidth={dayWidth}
                timelineStart={timelineStart}
                todayTime={todayTime}
                text={text}
              />
              <GanttTimelineBody
                rows={rows}
                columns={columns}
                dayWidth={dayWidth}
                timelineStart={timelineStart}
                todayTime={todayTime}
                hoveredRow={hoveredRow}
                onHover={setHoveredRow}
                text={text}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

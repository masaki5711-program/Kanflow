"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Diamond, TriangleAlert } from "lucide-react"
import { Badge, IconButton, cn, type BadgeTone } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateRange, formatShortDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { stageStatusLabel, type PunchItem, type Stage } from "./milestone-types"

interface Props {
  stages: readonly Stage[]
  punchItems: readonly PunchItem[]
  nameOf: (s: { name: string; i18n: unknown }) => string
  onOpen: (stageId: string) => void
}

const STATUS_TONE: Record<string, BadgeTone> = { done: "success", in_progress: "info", on_hold: "warning", not_started: "neutral" }

/**
 * The gates in plan order, left to right (scrolls sideways on a phone). Each
 * card: milestone diamond, status, planned (or 日程未定) and actual dates,
 * 完了条件 n/m and open 残課題; a late stage is red. Click / Enter opens it.
 */
export function StageTrack({ stages, punchItems, nameOf, onOpen }: Props) {
  const { t } = useLanguage()
  const { trackRef, scroll, measure, scrollBy } = useTrackScroll(stages.length)
  const openPunch = new Map<string, number>()
  for (const p of punchItems) {
    if (p.status !== "done" && p.planItemId) openPunch.set(p.planItemId, (openPunch.get(p.planItemId) ?? 0) + 1)
  }
  return (
    <section aria-label={t.msStageTrack} className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-body-lg font-semibold text-fg">{t.msStageTrack}</h2>
        {(scroll.left || scroll.right) && (
          <div className="flex gap-1">
            <IconButton label={t.msScrollPrev} icon={<ChevronLeft className="h-4 w-4" />} size="sm" disabled={!scroll.left} onClick={() => scrollBy(-1)} />
            <IconButton label={t.msScrollNext} icon={<ChevronRight className="h-4 w-4" />} size="sm" disabled={!scroll.right} onClick={() => scrollBy(1)} />
          </div>
        )}
      </div>
      <div className="relative">
      {/* Edge fades say "more gates this way" when the track overflows. */}
      {scroll.left && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface-muted to-transparent" />}
      {scroll.right && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface-muted to-transparent" />}
      <ol ref={trackRef} onScroll={measure} className="flex snap-x gap-1 overflow-x-auto pb-2" data-testid="ms-stage-track">
        {stages.map((stage, i) => (
          <li key={stage.id} className="flex shrink-0 snap-start items-stretch">
            <StageCard stage={stage} index={i} name={nameOf(stage)} openPunch={openPunch.get(stage.id) ?? 0} onOpen={() => onOpen(stage.id)} />
            {i < stages.length - 1 && <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 self-center text-fg-subtle" />}
          </li>
        ))}
      </ol>
      </div>
    </section>
  )
}

interface CardProps {
  stage: Stage
  index: number
  name: string
  openPunch: number
  onOpen: () => void
}

function StageCard({ stage, index, name, openPunch, onOpen }: CardProps) {
  const { t, language } = useLanguage()
  const late = stage.scheduleState === "delayed"
  const done = stage.status === "done"
  const conditionsDone = stage.conditions.filter((c) => c.checked).length
  const range = (start: string | null, end: string | null) =>
    stage.isMilestone || start === end ? formatShortDate(end ?? "", language, { utc: true }) : formatDateRange(start ?? "", end ?? "", language, { utc: true, year: false })
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={fillTemplate(t.msStageOpen, { name })}
      data-testid={`ms-stage-${stage.id}`}
      data-late={late || undefined}
      className={cn(
        "flex w-44 flex-col gap-1.5 rounded-ui-lg border-2 p-3 text-left shadow-ui-sm transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-52",
        late ? "border-danger bg-danger-soft/40" : done ? "border-success/50 bg-success-soft/40" : "border-border bg-surface",
      )}
    >
      <span className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0 text-caption font-bold tabular-nums text-fg-muted">{index + 1}</span>
        {stage.isMilestone && <Diamond aria-label={t.msMilestone} className="mt-0.5 h-4 w-4 shrink-0 fill-primary text-primary" />}
        <span className="line-clamp-2 min-w-0 text-body font-semibold text-fg">{name}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        <Badge tone={STATUS_TONE[stage.status] ?? "neutral"}>{stageStatusLabel(stage.status, t)}</Badge>
        {late && (
          <Badge tone="danger">
            <TriangleAlert aria-hidden="true" className="mr-0.5 inline h-3 w-3" />
            {t.msLate}
          </Badge>
        )}
      </span>
      <span className={cn("text-caption", stage.plannedEnd ? (late ? "font-semibold text-danger-strong" : "text-fg") : "italic text-fg-muted")}>
        {t.msPlanned}: {stage.plannedEnd ? range(stage.plannedStart, stage.plannedEnd) : t.msUndated}
      </span>
      {(stage.actualStart || stage.actualEnd) && (
        <span className="text-caption text-fg-muted">
          {t.msActual}: {range(stage.actualStart ?? stage.actualEnd, stage.actualEnd ?? stage.actualStart)}
        </span>
      )}
      {stage.conditions.length > 0 && <ConditionMeter done={conditionsDone} total={stage.conditions.length} />}
      {openPunch > 0 && <span className="text-caption font-medium text-warning-strong">{fillTemplate(t.msPunchCount, { n: openPunch })}</span>}
    </button>
  )
}

function ConditionMeter({ done, total }: { done: number; total: number }) {
  const { t } = useLanguage()
  const pct = Math.round((done / total) * 100)
  return (
    <span className="block">
      <span className="text-caption text-fg-muted">{fillTemplate(t.msConditionsCount, { done, total })}</span>
      <span aria-hidden="true" className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <span className={cn("block h-full rounded-full", done === total ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

/** Whether the track can scroll either way (kept fresh on scroll / resize), and paging by ~one view. */
function useTrackScroll(count: number) {
  const trackRef = useRef<HTMLOListElement>(null)
  const [scroll, setScroll] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const next = { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }
    setScroll((prev) => (prev.left === next.left && prev.right === next.right ? prev : next))
  }, [])
  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, count])
  const scrollBy = (dir: -1 | 1) => trackRef.current?.scrollBy({ left: dir * trackRef.current.clientWidth * 0.8, behavior: "smooth" })
  return { trackRef, scroll, measure, scrollBy }
}

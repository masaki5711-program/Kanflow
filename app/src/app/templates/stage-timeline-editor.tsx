"use client"

import { useId, useMemo, useRef } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react"
import { Button, IconButton, Input, cn, useToast } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import type { TemplateLink } from "@/lib/plan-templates/links"
import { TEMPLATE_MAX_NODES } from "@/lib/plan-templates/schema"
import { insertAfter, updateNode } from "@/lib/plan-templates/stage-ops"
import { countEditorNodes, effectiveLinks, emptyStage, type EditorNode } from "./lib/editor-state"
import { arrowPath, buildTimeline, dayPxFor, type TimelineRow } from "./lib/stage-timeline"
import { applyStageOp, stageCan } from "./stage-tree-editor"
import { blockText, type StageOp } from "./stage-row-editor"
import { useDurationResize, useLinkDrag } from "./use-timeline-drag"

interface Props {
  stages: EditorNode[]
  onStagesChange: (stages: EditorNode[]) => void
  /** All stored links (the ones that no longer hold are ignored). */
  links: TemplateLink[]
  onLinksChange: (links: TemplateLink[]) => void
  disabled: boolean
}

const ROW_H = 40
const HEADER_H = 28
const BAR_TOP = 9
const BAR_H = ROW_H - BAR_TOP * 2
const HANDLE = 14
/** Pointer hit area around the ● (touch friendly). */
const HIT = 24

/** Day numbers shown on the axis: every 5th day, thinned out when the axis is squeezed. */
function tickStep(dayPx: number): number {
  return dayPx >= 8 ? 5 : dayPx >= 4 ? 10 : 30
}

/**
 * Visual stage editor: one row per stage, a bar per stage on a day axis
 * (placed by the scheduler a load uses, so dependencies move the bars), and
 * the 先行 → 後続 arrows. Drag the ● at a bar's end onto another row to add a
 * dependency, click an arrow to remove it, drag a bar's right edge to change
 * its 目安期間. Structure (move / indent / child / remove) uses the same
 * operations as the list. The 先行工程 picker of the list view is the
 * keyboard route to dependencies.
 */
export function StageTimelineEditor({ stages, onStagesChange, links, onLinksChange, disabled }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const markerId = `tpl-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const bodyRef = useRef<HTMLDivElement>(null)
  const effective = useMemo(() => effectiveLinks(stages, links), [stages, links])
  const full = countEditorNodes(stages) >= TEMPLATE_MAX_NODES

  const base = useMemo(() => buildTimeline(stages, effective), [stages, effective])
  const dayPx = dayPxFor(base.span)
  const { resize, onResizePointerDown } = useDurationResize({
    dayPx,
    onCommit: (key, days) => {
      const row = base.rows.find((r) => r.key === key)
      if (row) onStagesChange(updateNode(stages, row.path, (n) => ({ ...n, durationDays: String(days) })))
    },
  })
  // While a bar is stretched the whole axis is recomputed, so followers move with it.
  const previewStages = useMemo(() => {
    const row = resize ? base.rows.find((r) => r.key === resize.key) : null
    return resize && row ? updateNode(stages, row.path, (n) => ({ ...n, durationDays: String(resize.days) })) : stages
  }, [resize, base, stages])
  const timeline = useMemo(() => (resize ? buildTimeline(previewStages, effective) : base), [resize, previewStages, effective, base])

  const rowKeys = useMemo(() => timeline.rows.map((r) => r.key), [timeline])
  const { drag, onConnectorPointerDown } = useLinkDrag({
    getBody: () => bodyRef.current,
    rowKeys,
    rowHeight: ROW_H,
    stages,
    links: effective,
    onLink: (link) => onLinksChange([...links, link]),
    onRejected: (block) => toast.error(blockText(t, block)),
  })

  const rowIndex = new Map(timeline.rows.map((r, i) => [r.key, i]))
  const rowOf = (key: string) => timeline.rows[rowIndex.get(key) ?? 0]
  const width = timeline.span * dayPx
  const step = tickStep(dayPx)
  const ticks = Array.from({ length: Math.ceil(timeline.span / step) }, (_, i) => i * step)

  function runOp(row: TimelineRow, op: StageOp) {
    const result = applyStageOp(stages, row.path, op)
    if (result) onStagesChange(result.nodes)
  }

  function addTop() {
    onStagesChange(insertAfter(stages, null, emptyStage()).nodes)
  }

  const barTitle = (row: TimelineRow) =>
    fillTemplate(t.tplBarTitle, { name: row.name || t.tplStageName, start: row.start + 1, end: row.end + 1, n: row.end - row.start + 1 })

  return (
    <div className="space-y-2">
      <div role="group" aria-label={t.tplTimelineLabel} className="overflow-x-auto rounded-ui-lg border border-border bg-surface" data-testid="tpl-timeline">
        <div className="grid [--tl-left:13rem] sm:[--tl-left:23rem]" style={{ gridTemplateColumns: `var(--tl-left) ${width}px`, width: `calc(var(--tl-left) + ${width}px)` }}>
          <div className="sticky left-0 z-20 flex items-center border-b border-r border-border bg-surface-muted px-2 text-caption font-medium text-fg-muted" style={{ height: HEADER_H }}>
            {fillTemplate(t.tplLinksCount, { n: effective.length })}
          </div>
          <div className="relative border-b border-border bg-surface-muted" style={{ height: HEADER_H }} aria-hidden="true">
            {ticks.map((d) => (
              <span key={d} className="absolute top-0 flex h-full items-center border-l border-border pl-1 text-caption tabular-nums text-fg-muted" style={{ left: d * dayPx }}>
                {d + 1}
              </span>
            ))}
          </div>

          <ul className="sticky left-0 z-10 border-r border-border bg-surface" aria-label={t.tplStages}>
            {timeline.rows.map((row) => (
              <li
                key={row.key}
                data-stage-key={row.key}
                className={cn("flex items-center gap-1 border-b border-border/60 pr-1", drag?.targetKey === row.key && (drag.block ? "bg-danger-soft" : "bg-primary-soft"))}
                style={{ height: ROW_H, paddingLeft: 6 + row.depth * 14 }}
              >
                <Input
                  data-stage-input={row.key}
                  aria-label={t.tplStageName}
                  value={row.node.name}
                  maxLength={255}
                  disabled={disabled}
                  onChange={(e) => onStagesChange(updateNode(stages, row.path, (n) => ({ ...n, name: e.target.value })))}
                  className={cn("h-8 min-w-0 flex-1", row.depth === 0 && "font-medium")}
                />
                <StageOps row={row} full={full} disabled={disabled} onOp={(op) => runOp(row, op)} />
              </li>
            ))}
          </ul>

          <div ref={bodyRef} className="relative select-none" style={{ height: timeline.rows.length * ROW_H }}>
            {ticks.map((d) => (
              <span key={d} aria-hidden="true" className="absolute top-0 h-full border-l border-border/50" style={{ left: d * dayPx }} />
            ))}
            {timeline.rows.map((row, i) => (
              <div
                key={row.key}
                aria-hidden="true"
                className={cn("absolute inset-x-0 border-b border-border/60", drag?.targetKey === row.key && (drag.block ? "bg-danger-soft/70" : "bg-primary-soft/70"))}
                style={{ top: i * ROW_H, height: ROW_H }}
              />
            ))}

            <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={timeline.rows.length * ROW_H}>
              <defs>
                <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 z" className="fill-fg-muted" />
                </marker>
              </defs>
              {effective.map((l) => {
                const from = rowOf(l.from)
                const to = rowOf(l.to)
                const d = arrowPath((from.end + 1) * dayPx, (rowIndex.get(l.from) ?? 0) * ROW_H + ROW_H / 2, to.start * dayPx, (rowIndex.get(l.to) ?? 0) * ROW_H + ROW_H / 2)
                const label = fillTemplate(t.tplLinkRemove, { from: from.name || t.tplStageName, to: to.name || t.tplStageName })
                return (
                  <g key={`${l.from}>${l.to}`} data-tpl-link={`${l.from}>${l.to}`}>
                    <path d={d} fill="none" strokeWidth={1.5} markerEnd={`url(#${markerId})`} className="stroke-fg-muted" />
                    {!disabled && (
                      <path
                        d={d}
                        fill="none"
                        strokeWidth={10}
                        className="cursor-pointer stroke-transparent hover:stroke-primary/25"
                        style={{ pointerEvents: "stroke" }}
                        onClick={() => onLinksChange(links.filter((x) => !(x.from === l.from && x.to === l.to)))}
                      >
                        <title>{label}</title>
                      </path>
                    )}
                  </g>
                )
              })}
              {drag && (
                <line
                  x1={(rowOf(drag.sourceKey).end + 1) * dayPx + 4 + HANDLE / 2}
                  y1={(rowIndex.get(drag.sourceKey) ?? 0) * ROW_H + ROW_H / 2}
                  x2={drag.x}
                  y2={drag.y}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  className={drag.block ? "stroke-danger" : "stroke-primary-strong"}
                />
              )}
            </svg>

            {timeline.rows.map((row, i) => (
              <Bar
                key={row.key}
                row={row}
                top={i * ROW_H}
                dayPx={dayPx}
                title={barTitle(row)}
                resizeLabel={fillTemplate(t.tplResizeDuration, { name: row.name || t.tplStageName })}
                handleLabel={fillTemplate(t.tplLinkHandle, { name: row.name || t.tplStageName })}
                unit={t.tplDaysUnit}
                disabled={disabled}
                onConnect={(e) => onConnectorPointerDown(e, row.key)}
                onResize={(e) => onResizePointerDown(e, row.key, row.end - row.start + 1)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addTop} disabled={disabled || full} data-testid="tpl-add-stage">
          {t.tplAddStage}
        </Button>
        {full && <span className="text-caption text-warning-hover">{t.tplLimitReached}</span>}
      </div>
    </div>
  )
}

function StageOps({ row, full, disabled, onOp }: { row: TimelineRow; full: boolean; disabled: boolean; onOp: (op: StageOp) => void }) {
  const { t } = useLanguage()
  const can = stageCan(row.path, row.node, row.siblings, full)
  const ops: Array<{ op: StageOp; label: string; icon: React.ReactNode; enabled: boolean }> = [
    { op: "up", label: t.tplMoveUp, icon: <ArrowUp className="h-4 w-4" />, enabled: can.up },
    { op: "down", label: t.tplMoveDown, icon: <ArrowDown className="h-4 w-4" />, enabled: can.down },
    { op: "outdent", label: t.tplOutdent, icon: <ArrowLeft className="h-4 w-4" />, enabled: can.outdent },
    { op: "indent", label: t.tplIndent, icon: <ArrowRight className="h-4 w-4" />, enabled: can.indent },
    { op: "child", label: t.tplAddChild, icon: <CornerDownRight className="h-4 w-4" />, enabled: can.child },
    { op: "remove", label: t.tplRemoveStage, icon: <Trash2 className="h-4 w-4" />, enabled: true },
  ]
  return (
    <div role="group" aria-label={row.name || t.tplStages} className="hidden shrink-0 items-center sm:flex">
      {ops.map((o) => (
        <IconButton key={o.op} size="sm" label={o.label} data-op={o.op} icon={o.icon} disabled={disabled || !o.enabled} onClick={() => onOp(o.op)} />
      ))}
    </div>
  )
}

interface BarProps {
  row: TimelineRow
  top: number
  dayPx: number
  title: string
  resizeLabel: string
  handleLabel: string
  unit: string
  disabled: boolean
  onConnect: (e: React.PointerEvent<HTMLElement>) => void
  onResize: (e: React.PointerEvent<HTMLElement>) => void
}

/** One stage's bar (task), bracket (group of stages) or diamond (milestone) with its ● connector. */
function Bar({ row, top, dayPx, title, resizeLabel, handleLabel, unit, disabled, onConnect, onResize }: BarProps) {
  const days = row.end - row.start + 1
  const left = row.start * dayPx
  const connectorX = (row.end + 1) * dayPx + 4
  return (
    <>
      {row.kind === "milestone" ? (
        <span
          data-bar={row.key}
          role="img"
          aria-label={title}
          title={title}
          className="absolute h-3.5 w-3.5 rotate-45 rounded-ui-sm bg-primary-strong shadow-ui-sm"
          style={{ left: left + dayPx / 2 - 7, top: top + ROW_H / 2 - 7 }}
        />
      ) : row.kind === "group" ? (
        <span data-bar={row.key} role="img" aria-label={title} title={title} className="absolute rounded-full bg-fg-subtle/60" style={{ left, width: days * dayPx, top: top + ROW_H / 2 - 3, height: 6 }} />
      ) : (
        <span
          data-bar={row.key}
          role="img"
          aria-label={title}
          title={title}
          className="absolute flex items-center overflow-hidden rounded-ui-sm bg-primary px-1.5 text-caption font-medium tabular-nums text-white shadow-ui-sm"
          style={{ left, width: days * dayPx, top: top + BAR_TOP, height: BAR_H }}
        >
          {days * dayPx >= 40 && <span aria-hidden="true">{`${days}${unit}`}</span>}
          {!disabled && (
            <span
              aria-hidden="true"
              title={resizeLabel}
              data-resize={row.key}
              onPointerDown={onResize}
              className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none bg-black/0 hover:bg-black/20"
            />
          )}
        </span>
      )}
      {!disabled && (
        <span
          aria-hidden="true"
          title={handleLabel}
          data-connector={row.key}
          onPointerDown={onConnect}
          className="group/handle absolute flex cursor-crosshair touch-none items-center justify-center"
          style={{ left: connectorX - 5, top: top + ROW_H / 2 - HIT / 2, width: HIT, height: HIT }}
        >
          <span className="rounded-full border-2 border-primary bg-surface group-hover/handle:bg-primary" style={{ width: HANDLE, height: HANDLE }} />
        </span>
      )}
    </>
  )
}

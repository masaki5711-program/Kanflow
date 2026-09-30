"use client"

import { useId } from "react"
import { Gauge } from "lucide-react"
import { EmptyState, SkeletonCard, VisuallyHidden } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { formatPointUnit } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import {
  V_HEIGHT, V_INNER_WIDTH, V_PADDING, V_WIDTH, velocityScale,
  type VelocityData, type VelocityScale,
} from "./velocity-geometry"
import { axisLabels, unitsForWidth } from "./velocity-labels"

/** Series colours from the kit tokens (legend and marks stay in sync). */
const COLOR = {
  completed: "var(--color-primary)",
  capacity: "var(--color-border-strong)",
  average: "var(--color-warning)",
  grid: "var(--color-border)",
  text: "var(--color-fg-muted)",
  value: "var(--color-fg)",
} as const
const FONT = 12
const WINDOW = 8

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function Grid({ scale }: { scale: VelocityScale }) {
  return (
    <g>
      {scale.ticks.map((v) => (
        <g key={v}>
          <line x1={V_PADDING.left} x2={V_PADDING.left + V_INNER_WIDTH} y1={scale.toY(v)} y2={scale.toY(v)} stroke={COLOR.grid} strokeWidth="1" />
          <text x={V_PADDING.left - 8} y={scale.toY(v) + 4} textAnchor="end" fontSize={FONT} fill={COLOR.text}>{v}</text>
        </g>
      ))}
    </g>
  )
}

/** Line height of the two-line x-axis labels. */
const LABEL_LINE = 14

function Bars({ sprints, names, scale }: { sprints: VelocityData["sprints"]; names: string[]; scale: VelocityScale }) {
  const base = scale.toY(0)
  const slot = sprints.length > 1 ? scale.bar(1).center - scale.bar(0).center : V_INNER_WIDTH
  const labels = axisLabels(names, unitsForWidth(slot - 4, FONT))
  return (
    <g>
      {sprints.map((s, i) => {
        const { x, width, center } = scale.bar(i)
        const top = scale.toY(s.points)
        return (
          <g key={s.id}>
            <title>{names[i]}</title>
            {s.capacity > 0 && (
              <rect x={x} y={scale.toY(s.capacity)} width={width} height={base - scale.toY(s.capacity)} rx={4}
                fill="none" stroke={COLOR.capacity} strokeWidth="1.5" strokeDasharray="4,3" />
            )}
            <rect x={x + 3} y={top} width={Math.max(width - 6, 2)} height={Math.max(base - top, 0)} rx={3} fill={COLOR.completed} />
            <text x={center} y={top - 6} textAnchor="middle" fontSize={FONT} fontWeight="600" fill={COLOR.value}>{fmt(s.points)}</text>
            <text x={center} y={base + 16} textAnchor="middle" fontSize={FONT} fill={COLOR.text}>
              {labels[i].map((line, n) => <tspan key={n} x={center} dy={n === 0 ? 0 : LABEL_LINE}>{line}</tspan>)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function AverageLine({ average, scale, label }: { average: number; scale: VelocityScale; label: string }) {
  const y = scale.toY(average)
  const right = V_PADDING.left + V_INNER_WIDTH
  return (
    <g>
      <line x1={V_PADDING.left} x2={right} y1={y} y2={y} stroke={COLOR.average} strokeWidth="2" strokeDasharray="6,4" />
      <text x={right} y={y - 6} textAnchor="end" fontSize={FONT} fontWeight="600" fill={COLOR.average}>{label}</text>
    </g>
  )
}

function Legend({ unit }: { unit: string }) {
  const { t } = useLanguage()
  const swatch = "inline-block h-3 w-3 rounded-sm"
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg" aria-hidden="true">
      <li className="flex items-center gap-1.5"><span className={swatch} style={{ background: COLOR.completed }} />{t.velocityCompleted} ({unit})</li>
      <li className="flex items-center gap-1.5"><span className={`${swatch} border-[1.5px] border-dashed`} style={{ borderColor: COLOR.capacity }} />{t.velocityCapacity}</li>
      <li className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: COLOR.average }} />{t.velocityAverageLegend}</li>
    </ul>
  )
}

/**
 * Velocity: completed points of the last 8 finished sprints (bars), their
 * capacity (dashed outline) and the average (dashed line). Screen readers get
 * the same numbers as a table.
 */
export default function VelocityChart({ projectId }: { projectId: string }) {
  const { t, language } = useLanguage()
  const titleId = useId()
  const { data, error, isLoading } = useApiQuery<VelocityData>(`/api/projects/${projectId}/velocity`, { toastOnError: true })

  if (isLoading) return <SkeletonCard label={t.loading} />

  const sprints = data?.sprints ?? []
  // Sprint names in the viewer's language (A4-02).
  const names = sprints.map((s) => pickText(s.i18n, "sprintName", s.name, language).text)
  const unit = formatPointUnit(data?.pointUnit, t)
  const average = data?.average ?? null
  const scale = velocityScale({ sprints, average })
  const averageText = average === null ? "" : t.velocityAverage.replace("{value}", `${fmt(average)} ${unit}`)

  return (
    <section aria-labelledby={titleId} className="rounded-ui-md border border-border bg-surface p-5 shadow-ui-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-body-lg font-semibold text-fg">{t.velocityTitle}</h3>
          <p className="text-caption text-fg-muted">{t.velocityDescription.replace("{count}", String(WINDOW))}</p>
        </div>
        {average !== null && <p className="text-title font-bold text-fg">{averageText}</p>}
      </div>

      {sprints.length === 0 ? (
        <EmptyState compact headingLevel={4} icon={<Gauge className="h-6 w-6" />}
          title={error && !data ? t.error : t.velocityEmpty} description={error && !data ? error.message : undefined} />
      ) : (
        <>
          <Legend unit={unit} />
          <div className="mt-2 overflow-x-auto">
            <svg
              viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`}
              className="h-auto w-full"
              style={{ minWidth: 480, maxHeight: 300 }}
              role="img"
              aria-label={t.velocityChartLabel.replace("{count}", String(sprints.length)).replace("{average}", `${fmt(average ?? 0)} ${unit}`)}
            >
              <Grid scale={scale} />
              <Bars sprints={sprints} names={names} scale={scale} />
              {average !== null && <AverageLine average={average} scale={scale} label={fmt(average)} />}
            </svg>
          </div>
          <VisuallyHidden as="div">
            <table>
              <caption>{t.velocityTableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.velocitySprintColumn}</th>
                  <th scope="col">{t.velocityCompleted}</th>
                  <th scope="col">{t.velocityCapacity}</th>
                </tr>
              </thead>
              <tbody>
                {sprints.map((s, i) => (
                  <tr key={s.id}>
                    <th scope="row">{names[i]}</th>
                    <td>{fmt(s.points)} {unit}</td>
                    <td>{fmt(s.capacity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </VisuallyHidden>
        </>
      )}
    </section>
  )
}

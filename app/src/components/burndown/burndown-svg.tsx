"use client"

import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { formatShortDate } from "@/lib/format-date"
import { pickText } from "@/lib/translation/pick-text"
import { TONE_COLOR, TONE_SOFT, sprintStatusTone } from "@/lib/design-tokens"
import {
  BAND_LABEL_Y, CHART_HEIGHT, CHART_WIDTH, INNER_HEIGHT, INNER_WIDTH, PADDING, TODAY_LABEL_Y,
  actualPoints, isWeekend, labelInterval, linePath, makeScale, pointsPath, sameSeries, yTicks,
  type BurndownData, type Scale, type SprintMarker,
} from "./burndown-geometry"

/** Series colours come from the design tokens so legend and lines stay in sync. */
export const SERIES_COLOR = {
  plan: "var(--color-danger)",
  ideal: "var(--color-warning)",
  actual: "var(--color-success)",
  today: "var(--color-primary)",
} as const

/**
 * Sprint band colours follow the sprint-status Badge tone: the soft tone as a
 * translucent fill, the tone colour as the boundary stroke.
 */
export function sprintBand(status: string): { fill: string; stroke: string } {
  const tone = sprintStatusTone(status)
  return { fill: TONE_SOFT[tone], stroke: TONE_COLOR[tone] }
}
const BAND_FILL_OPACITY = 0.6

const FONT = 12
const TEXT_MUTED = "var(--color-fg-muted)"
const GRID = "var(--color-border)"

function SprintBand({ marker, scale, dayCount, countTemplate }: { marker: SprintMarker; scale: Scale; dayCount: number; countTemplate: string }) {
  const { language } = useLanguage()
  if (marker.startIndex < 0 && marker.endIndex < 0) return null
  const x1 = scale.toX(Math.max(marker.startIndex, 0))
  const x2 = scale.toX(marker.endIndex >= 0 ? marker.endIndex : dayCount - 1)
  const { fill, stroke } = sprintBand(marker.status)
  const bottom = PADDING.top + INNER_HEIGHT
  return (
    <g>
      <rect x={x1} y={PADDING.top} width={Math.max(x2 - x1, 1)} height={INNER_HEIGHT} fill={fill} fillOpacity={BAND_FILL_OPACITY} />
      <line x1={x1} y1={PADDING.top} x2={x1} y2={bottom} stroke={stroke} strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
      <line x1={x2} y1={PADDING.top} x2={x2} y2={bottom} stroke={stroke} strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
      {/* Above the plot area so the label never sits under the lines (cycle 3). */}
      <text x={(x1 + x2) / 2} y={BAND_LABEL_Y} textAnchor="middle" fontSize={FONT} fill={stroke} fontWeight="600">
        {pickText(marker.i18n, "sprintName", marker.name, language).text} ({fillTemplate(countTemplate, { count: marker.taskCount })})
      </text>
    </g>
  )
}

function Axes({ data, scale }: { data: BurndownData; scale: Scale }) {
  const { t, language } = useLanguage()
  const dayCount = data.days.length
  const interval = labelInterval(dayCount)
  const halfStep = INNER_WIDTH / Math.max(dayCount - 1, 1) / 2
  const midY = PADDING.top + INNER_HEIGHT / 2
  return (
    <g>
      {data.days.map((day, i) => isWeekend(day) ? (
        <rect key={`we-${day}`} x={scale.toX(i) - halfStep} y={PADDING.top} width={halfStep * 2} height={INNER_HEIGHT}
          fill="var(--color-surface-sunken)" opacity="0.5" />
      ) : null)}
      {yTicks(scale.maxY).map((v) => (
        <g key={`y-${v}`}>
          <line x1={PADDING.left} y1={scale.toY(v)} x2={PADDING.left + INNER_WIDTH} y2={scale.toY(v)} stroke={GRID} strokeWidth="0.5" />
          <text x={PADDING.left - 8} y={scale.toY(v) + 4} textAnchor="end" fontSize={FONT} fill={TEXT_MUTED}>{v}</text>
        </g>
      ))}
      <text x={14} y={midY} textAnchor="middle" fontSize={FONT} fill={TEXT_MUTED} transform={`rotate(-90, 14, ${midY})`}>
        {t.burndownRemainingTasks}
      </text>
      {data.days.map((day, i) => {
        if (i % interval !== 0 && i !== dayCount - 1) return null
        const d = new Date(`${day}T00:00:00`)
        const weekend = isWeekend(day)
        return (
          <g key={`x-${day}`}>
            <line x1={scale.toX(i)} y1={PADDING.top} x2={scale.toX(i)} y2={PADDING.top + INNER_HEIGHT}
              stroke={GRID} strokeWidth="0.5" strokeDasharray={weekend ? "2,2" : undefined} />
            <text x={scale.toX(i)} y={PADDING.top + INNER_HEIGHT + 18} textAnchor="middle" fontSize={FONT}
              fill={TEXT_MUTED} fontStyle={weekend ? "italic" : undefined}>
              {formatShortDate(d, language, { weekday: false })}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function TodayMarker({ index, scale }: { index: number; scale: Scale }) {
  const { t } = useLanguage()
  if (index < 0) return null
  const x = scale.toX(index)
  return (
    <g>
      <line x1={x} y1={PADDING.top} x2={x} y2={PADDING.top + INNER_HEIGHT} stroke={SERIES_COLOR.today} strokeWidth="1.5" strokeDasharray="4,3" />
      <text x={x} y={TODAY_LABEL_Y} textAnchor="middle" fontSize={FONT} fill={SERIES_COLOR.today} fontWeight="bold">
        {t.burndownToday}
      </text>
    </g>
  )
}

interface Props {
  data: BurndownData
  todayIndex: number
  label: string
}

/** The burndown plot itself (bands, axes, today marker, plan/ideal/actual lines). */
export default function BurndownSvg({ data, todayIndex, label }: Props) {
  const { t } = useLanguage()
  const points = actualPoints(data)
  const scale = makeScale(data, points)
  const lastPoint = points[points.length - 1]

  return (
    // The SVG never renders narrower than its viewBox, so 12-unit labels stay
    // >= 12px; on narrow screens the container scrolls horizontally instead.
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.burndownScrollRegion}>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-auto" style={{ minWidth: CHART_WIDTH, maxHeight: 360 }} role="img" aria-label={label}>
        <rect x={PADDING.left} y={PADDING.top} width={INNER_WIDTH} height={INNER_HEIGHT}
          fill="var(--color-surface-muted)" stroke={GRID} strokeWidth="1" />
        {data.sprintMarkers.map((sm) => (
          <SprintBand key={`band-${sm.id}`} marker={sm} scale={scale} dayCount={data.days.length} countTemplate={t.burndownBandTaskCount} />
        ))}
        <Axes data={data} scale={scale} />
        <TodayMarker index={todayIndex} scale={scale} />
        <line x1={PADDING.left} y1={scale.toY(0)} x2={PADDING.left + INNER_WIDTH} y2={scale.toY(0)} stroke="var(--color-fg-subtle)" strokeWidth="1" />
        <path d={linePath(data.planLine, scale)} fill="none" stroke={SERIES_COLOR.plan} strokeWidth="1.5" strokeDasharray="6,3" />
        {/* A one-sprint ideal line equals the plan line: draw it once instead of two overlapping dashes. */}
        {!sameSeries(data.idealLine, data.planLine) && (
          <path d={linePath(data.idealLine, scale)} fill="none" stroke={SERIES_COLOR.ideal} strokeWidth="1.5" strokeDasharray="1,4" strokeLinecap="round" />
        )}
        <path d={pointsPath(points, scale)} fill="none" stroke={SERIES_COLOR.actual} strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={`pt-${p.x}-${i === 0 ? "b" : "v"}`} cx={scale.toX(p.x)} cy={scale.toY(p.y)} r="4"
            fill={SERIES_COLOR.actual} stroke="white" strokeWidth="2" />
        ))}
        {lastPoint && (
          <text x={scale.toX(lastPoint.x) + 8} y={scale.toY(lastPoint.y) - 8} fontSize={FONT} fontWeight="bold" fill={SERIES_COLOR.actual}>
            {lastPoint.y}
          </text>
        )}
      </svg>
    </div>
  )
}

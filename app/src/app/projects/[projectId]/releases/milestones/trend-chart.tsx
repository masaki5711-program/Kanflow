"use client"

import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { metricOnTarget } from "@/lib/milestones/summary"
import type { Metric } from "./milestone-types"

const W = 560
const H = 180
const PAD = { left: 44, right: 12, top: 12, bottom: 26 }

export interface ChartPoint {
  month: string
  value: number
  x: number
  y: number
}

/** Pure: plot coordinates of the monthly values (and the y of the target / baseline lines). */
export function chartGeometry(metric: Pick<Metric, "points" | "targetValue" | "baselineValue">) {
  const values = [...metric.points.map((p) => p.value), metric.targetValue, metric.baselineValue].filter((v): v is number => v !== null)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) || 1
  const lo = min - span * 0.1
  const hi = max + span * 0.1
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const n = metric.points.length
  const x = (i: number) => PAD.left + (n <= 1 ? (W - PAD.left - PAD.right) / 2 : (i / (n - 1)) * (W - PAD.left - PAD.right))
  const points: ChartPoint[] = metric.points.map((p, i) => ({ month: p.month, value: p.value, x: x(i), y: y(p.value) }))
  return {
    points,
    targetY: metric.targetValue !== null ? y(metric.targetValue) : null,
    baselineY: metric.baselineValue !== null ? y(metric.baselineValue) : null,
    lo,
    hi,
  }
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : String(Math.round(v * 100) / 100))

/** A small line chart of a 推移 metric: monthly values, target (dashed green) and baseline (dotted). */
export function TrendChart({ metric }: { metric: Metric }) {
  const { t } = useLanguage()
  if (metric.points.length === 0) return <p className="py-4 text-caption text-fg-muted">{t.msChartEmpty}</p>
  const g = chartGeometry(metric)
  const line = g.points.map((p) => `${p.x},${p.y}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fillTemplate(t.msChartLabel, { name: metric.name })} className="h-auto w-full min-w-[26rem] max-w-2xl">
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} className="stroke-border" />
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="stroke-border" />
      <text x={PAD.left - 4} y={PAD.top + 8} textAnchor="end" className="fill-fg-muted text-[10px]">{fmt(g.hi)}</text>
      <text x={PAD.left - 4} y={H - PAD.bottom} textAnchor="end" className="fill-fg-muted text-[10px]">{fmt(g.lo)}</text>
      {g.baselineY !== null && <line x1={PAD.left} x2={W - PAD.right} y1={g.baselineY} y2={g.baselineY} strokeDasharray="2 4" className="stroke-fg-subtle" />}
      {g.targetY !== null && (
        <>
          <line x1={PAD.left} x2={W - PAD.right} y1={g.targetY} y2={g.targetY} strokeDasharray="6 4" strokeWidth={1.5} className="stroke-success" />
          <text x={PAD.left + 4} y={g.targetY - 4} textAnchor="start" className="fill-success-strong text-[10px]">{`${t.msMetricTarget} ${fmt(metric.targetValue ?? 0)}`}</text>
        </>
      )}
      <polyline points={line} fill="none" strokeWidth={2} className="stroke-primary" />
      {g.points.map((p) => {
        const good = metricOnTarget(metric.direction, p.value, metric.targetValue)
        return (
          <g key={p.month}>
            <circle cx={p.x} cy={p.y} r={4} className={good === false ? "fill-danger" : "fill-primary"} />
            <text x={p.x} y={p.y - 8} textAnchor="middle" className="fill-fg text-[10px]">{fmt(p.value)}</text>
            <text x={p.x} y={H - 8} textAnchor="middle" className="fill-fg-muted text-[10px]">{p.month.slice(2).replace("-", "/")}</text>
          </g>
        )
      })}
    </svg>
  )
}

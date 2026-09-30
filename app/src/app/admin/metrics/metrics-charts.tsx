"use client"

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CHART_GRID_COLOR, CHART_SERIES_COLORS, TONE_COLOR } from "@/lib/design-tokens"
import type { ChartRow } from "./metrics-format"

export interface MetricsSeries {
  key: keyof ChartRow
  label: string
  /** Right axis (e.g. latency next to a count). */
  right?: boolean
  color?: string
}

interface MetricsLineChartProps {
  title: string
  rows: readonly ChartRow[]
  series: readonly MetricsSeries[]
  height?: number
}

const TICK = { fontSize: 12, fill: "var(--color-fg-muted)" }

/** Small time-series line chart in the kit palette (history of 5-minute snapshots). */
export function MetricsLineChart({ title, rows, series, height = 220 }: MetricsLineChartProps) {
  const hasRight = series.some((s) => s.right)
  return (
    <figure className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
      <figcaption className="mb-2 text-body font-semibold text-fg">{title}</figcaption>
      <div style={{ width: "100%", height }} role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows as ChartRow[]} margin={{ top: 4, right: hasRight ? 4 : 12, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
            <XAxis dataKey="time" tick={TICK} minTickGap={24} />
            <YAxis yAxisId="left" tick={TICK} allowDecimals={false} />
            {hasRight && <YAxis yAxisId="right" orientation="right" tick={TICK} />}
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Line
                key={s.key}
                yAxisId={s.right ? "right" : "left"}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export const WARNING_COLOR = TONE_COLOR.warning
export const DANGER_COLOR = TONE_COLOR.danger

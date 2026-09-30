"use client"

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { CHART_GRID_COLOR, CHART_SERIES_COLORS } from "@/lib/design-tokens"
import type { ChartSpec } from "./chart-spec"

// Shared chart palette (CSS variables from globals.css, primary first).
const COLORS = CHART_SERIES_COLORS

/**
 * Renders an AI-emitted chart spec with Recharts. Loaded lazily from the chat
 * page so recharts stays out of the initial bundle.
 */
export default function ChatChart({ spec }: { spec: ChartSpec }) {
  const height = 240

  return (
    <div className="my-2 border border-border rounded-lg bg-surface p-3">
      {spec.title && (
        <p className="text-caption font-semibold text-fg mb-2">{spec.title}</p>
      )}
      <div style={{ width: "100%", height }} role="img" aria-label={spec.title ?? spec.type}>
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "pie" ? (
            <PieChart>
              <Pie
                data={spec.data}
                dataKey={spec.series[0].key}
                nameKey={spec.x}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {spec.data.map((row, i) => (
                  <Cell key={`${String(row[spec.x])}-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : spec.type === "line" ? (
            <LineChart data={spec.data} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis dataKey={spec.x} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {spec.series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={spec.data} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis dataKey={spec.x} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {spec.series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  fill={COLORS[i % COLORS.length]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

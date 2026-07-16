"use client"

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import type { ChartSpec } from "./chart-spec"

// Palette aligned with the app's status colors (blue/emerald first).
const COLORS = ["#1e5ae6", "#0b8f6a", "#f59e0b", "#8b5cf6", "#e11d48", "#0a8f9e", "#64748b"]

/**
 * Renders an AI-emitted chart spec with Recharts. Loaded lazily from the chat
 * page so recharts stays out of the initial bundle.
 */
export default function ChatChart({ spec }: { spec: ChartSpec }) {
  const height = 240

  return (
    <div className="my-2 border border-gray-200 rounded-lg bg-white p-3">
      {spec.title && (
        <p className="text-xs font-semibold text-gray-700 mb-2">{spec.title}</p>
      )}
      <div style={{ width: "100%", height }}>
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
                {spec.data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : spec.type === "line" ? (
            <LineChart data={spec.data} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={spec.x} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey={spec.x} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
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

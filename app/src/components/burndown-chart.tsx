"use client"

import { useEffect, useState, useCallback } from "react"
import { useLanguage } from "@/lib/language-context"

interface SprintMarker {
  id: string
  name: string
  status: string
  startIndex: number
  endIndex: number
  taskCount: number
  doneCount: number
}

interface BurndownData {
  days: string[]
  totalTasks: number
  idealLine: number[]
  planLine: number[]
  actualLine: (number | null)[]
  actualBaseline: number | null
  sprintMarkers: SprintMarker[]
}

interface Props {
  projectId: string
  refreshKey?: number
}

const CHART_WIDTH = 800
const CHART_HEIGHT = 340
const PADDING = { top: 30, right: 30, bottom: 60, left: 60 }
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom

const sprintBandColors: Record<string, string> = {
  planning: "rgba(234,179,8,0.08)",
  active: "rgba(59,130,246,0.10)",
  review: "rgba(168,85,247,0.08)",
  done: "rgba(34,197,94,0.08)",
}

const sprintBorderColors: Record<string, string> = {
  planning: "#eab308",
  active: "#3b82f6",
  review: "#a855f7",
  done: "#22c55e",
}

export default function BurndownChart({ projectId, refreshKey }: Props) {
  const { t } = useLanguage()
  const [data, setData] = useState<BurndownData | null>(null)

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/burndown`)
    if (res.ok) setData(await res.json())
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  if (!data || data.days.length === 0) return null

  const dayCount = data.days.length
  if (dayCount <= 1) return null

  // Build the actual line points including baseline
  // If actualBaseline exists, the line starts at (firstActualIdx, baseline)
  // then goes to (firstActualIdx, firstActualValue)
  const actualPoints: { x: number; y: number }[] = []
  const firstActualIdx = data.actualLine.findIndex((v) => v !== null)

  if (data.actualBaseline !== null && firstActualIdx >= 0) {
    actualPoints.push({ x: firstActualIdx, y: data.actualBaseline })
  }
  for (let i = 0; i < data.actualLine.length; i++) {
    const v = data.actualLine[i]
    if (v !== null) {
      actualPoints.push({ x: i, y: v })
    }
  }

  // Calculate max Y from all lines including baseline
  const allValues = [
    ...data.idealLine,
    ...data.planLine,
    ...actualPoints.map((p) => p.y),
  ]
  const maxY = Math.max(...allValues, 1)

  function toX(index: number): number {
    return PADDING.left + (index / (dayCount - 1)) * INNER_WIDTH
  }

  function toY(value: number): number {
    return PADDING.top + INNER_HEIGHT - (value / maxY) * INNER_HEIGHT
  }

  function buildPath(values: (number | null)[]): string {
    let path = ""
    let started = false
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (v === null) continue
      const x = toX(i)
      const y = toY(v)
      if (!started) {
        path += `M ${x} ${y}`
        started = true
      } else {
        path += ` L ${x} ${y}`
      }
    }
    return path
  }

  // Build actual line path from points (may have baseline + data points)
  function buildActualPath(): string {
    if (actualPoints.length === 0) return ""
    let path = ""
    for (let i = 0; i < actualPoints.length; i++) {
      const p = actualPoints[i]
      const x = toX(p.x)
      const y = toY(p.y)
      if (i === 0) {
        path += `M ${x} ${y}`
      } else {
        path += ` L ${x} ${y}`
      }
    }
    return path
  }

  // Y-axis ticks (integers for task counts)
  const yTicks: number[] = []
  const ceilMax = Math.ceil(maxY)
  const tickStep = ceilMax <= 10 ? 1 : ceilMax <= 30 ? 5 : ceilMax <= 60 ? 10 : Math.ceil(ceilMax / 5 / 10) * 10
  for (let v = 0; v <= ceilMax; v += tickStep) {
    yTicks.push(v)
  }
  if (yTicks[yTicks.length - 1] < ceilMax) {
    yTicks.push(ceilMax)
  }

  // X-axis label interval
  const labelInterval = dayCount <= 14 ? 1 : dayCount <= 30 ? 2 : dayCount <= 60 ? 4 : Math.ceil(dayCount / 15)

  // Today marker (local timezone)
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const todayIndex = data.days.indexOf(todayStr)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-800">{t.burndownTitle}</h3>
        <div className="flex items-center gap-5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2 border-dashed border-red-500" /> {t.burndownPlan}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2 border-dashed border-yellow-500" /> {t.burndownIdeal}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-[3px] bg-green-500 rounded" /> {t.burndownActual}
          </span>
          <span className="text-gray-400">
            {t.burndownTotal.replace("{count}", String(data.totalTasks))}
          </span>
        </div>
      </div>

      {/* Sprint summary badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {data.sprintMarkers.map((sm) => (
          <div
            key={sm.id}
            className="text-xs px-2.5 py-1 rounded-md border flex items-center gap-2"
            style={{
              borderColor: sprintBorderColors[sm.status] ?? "#d1d5db",
              backgroundColor: sprintBandColors[sm.status] ?? "transparent",
            }}
          >
            <span className="font-medium">{sm.name}</span>
            <span className="text-gray-500">
              {sm.doneCount}/{sm.taskCount}{t.burndownCompleted}
            </span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full" style={{ maxHeight: "360px" }}>
        {/* Background */}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={INNER_WIDTH}
          height={INNER_HEIGHT}
          fill="#fafafa"
          stroke="#e5e7eb"
          strokeWidth="1"
        />

        {/* Sprint bands */}
        {data.sprintMarkers.map((sm) => {
          if (sm.startIndex < 0 && sm.endIndex < 0) return null
          const startIdx = Math.max(sm.startIndex, 0)
          const endIdx = sm.endIndex >= 0 ? sm.endIndex : dayCount - 1
          const x1 = toX(startIdx)
          const x2 = toX(endIdx)
          const fill = sprintBandColors[sm.status] ?? "rgba(200,200,200,0.1)"
          const borderColor = sprintBorderColors[sm.status] ?? "#d1d5db"
          return (
            <g key={`band-${sm.id}`}>
              <rect
                x={x1}
                y={PADDING.top}
                width={Math.max(x2 - x1, 1)}
                height={INNER_HEIGHT}
                fill={fill}
              />
              {/* Start boundary */}
              <line
                x1={x1}
                y1={PADDING.top}
                x2={x1}
                y2={PADDING.top + INNER_HEIGHT}
                stroke={borderColor}
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity="0.6"
              />
              {/* End boundary */}
              <line
                x1={x2}
                y1={PADDING.top}
                x2={x2}
                y2={PADDING.top + INNER_HEIGHT}
                stroke={borderColor}
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity="0.4"
              />
              {/* Sprint name label at top */}
              <text
                x={(x1 + x2) / 2}
                y={PADDING.top + 14}
                textAnchor="middle"
                fontSize="9"
                fill={borderColor}
                fontWeight="600"
              >
                {sm.name} ({sm.taskCount}{t.items})
              </text>
            </g>
          )
        })}

        {/* Weekend shading */}
        {data.days.map((day, i) => {
          const d = new Date(day + "T00:00:00")
          const dayOfWeek = d.getDay()
          if (dayOfWeek !== 0 && dayOfWeek !== 6) return null
          const halfStep = INNER_WIDTH / (dayCount - 1) / 2
          return (
            <rect
              key={`weekend-${i}`}
              x={toX(i) - halfStep}
              y={PADDING.top}
              width={halfStep * 2}
              height={INNER_HEIGHT}
              fill="#f3f4f6"
              opacity="0.3"
            />
          )
        })}

        {/* Y-axis grid lines and labels */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PADDING.left}
              y1={toY(v)}
              x2={PADDING.left + INNER_WIDTH}
              y2={toY(v)}
              stroke="#e5e7eb"
              strokeWidth="0.5"
            />
            <text
              x={PADDING.left - 8}
              y={toY(v) + 4}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          x={14}
          y={PADDING.top + INNER_HEIGHT / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#6b7280"
          transform={`rotate(-90, 14, ${PADDING.top + INNER_HEIGHT / 2})`}
        >
          {t.burndownRemainingTasks}
        </text>

        {/* X-axis labels */}
        {data.days.map((day, i) => {
          if (i % labelInterval !== 0 && i !== dayCount - 1) return null
          const d = new Date(day + "T00:00:00")
          const label = `${d.getMonth() + 1}/${d.getDate()}`
          const dayOfWeek = d.getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          return (
            <g key={`x-${i}`}>
              <line
                x1={toX(i)}
                y1={PADDING.top}
                x2={toX(i)}
                y2={PADDING.top + INNER_HEIGHT}
                stroke="#e5e7eb"
                strokeWidth="0.5"
                strokeDasharray={isWeekend ? "2,2" : undefined}
              />
              <text
                x={toX(i)}
                y={PADDING.top + INNER_HEIGHT + 16}
                textAnchor="middle"
                fontSize="9"
                fill={isWeekend ? "#d1d5db" : "#9ca3af"}
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* Today marker */}
        {todayIndex >= 0 && (
          <g>
            <line
              x1={toX(todayIndex)}
              y1={PADDING.top}
              x2={toX(todayIndex)}
              y2={PADDING.top + INNER_HEIGHT}
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeDasharray="4,3"
            />
            <text
              x={toX(todayIndex)}
              y={PADDING.top - 6}
              textAnchor="middle"
              fontSize="9"
              fill="#6366f1"
              fontWeight="bold"
            >
              TODAY
            </text>
          </g>
        )}

        {/* Zero line emphasis — drawn BEFORE actual line so it doesn't cover data points */}
        <line
          x1={PADDING.left}
          y1={toY(0)}
          x2={PADDING.left + INNER_WIDTH}
          y2={toY(0)}
          stroke="#9ca3af"
          strokeWidth="1"
        />

        {/* Plan line (red) - working days */}
        <path
          d={buildPath(data.planLine)}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeDasharray="6,3"
        />

        {/* Ideal line (yellow) - all days */}
        <path
          d={buildPath(data.idealLine)}
          fill="none"
          stroke="#eab308"
          strokeWidth="1.5"
          strokeDasharray="4,2"
        />

        {/* Actual line (green) — uses baseline + data points */}
        <path
          d={buildActualPath()}
          fill="none"
          stroke="#22c55e"
          strokeWidth="2.5"
        />

        {/* Actual data points — baseline point */}
        {data.actualBaseline !== null && firstActualIdx >= 0 && (
          <circle
            cx={toX(firstActualIdx)}
            cy={toY(data.actualBaseline)}
            r="4"
            fill="#22c55e"
            stroke="white"
            strokeWidth="2"
          />
        )}

        {/* Actual data points */}
        {data.actualLine.map((v, i) => {
          if (v === null) return null
          return (
            <circle
              key={`pt-${i}`}
              cx={toX(i)}
              cy={toY(v)}
              r="4"
              fill="#22c55e"
              stroke="white"
              strokeWidth="2"
            />
          )
        })}

        {/* Value label on the latest actual point */}
        {actualPoints.length > 0 && (() => {
          const lastPt = actualPoints[actualPoints.length - 1]
          return (
            <text
              x={toX(lastPt.x) + 8}
              y={toY(lastPt.y) - 8}
              fontSize="11"
              fontWeight="bold"
              fill="#16a34a"
            >
              {lastPt.y}
            </text>
          )
        })()}
      </svg>
    </div>
  )
}

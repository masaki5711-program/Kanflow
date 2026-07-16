/**
 * Chart spec for AI-generated ```chart fenced blocks in chat.
 * Kept free of recharts imports so the parser can be bundled with the page
 * while the actual renderer is lazy-loaded only when a chart appears.
 *
 * Expected JSON shape (emitted by the LLM, numbers sourced from tools):
 * {
 *   "type": "bar" | "line" | "pie",
 *   "title": "optional string",
 *   "x": "categoryKey",                       // bar/line: x-axis key; pie: name key
 *   "series": [{ "key": "value", "label": "表示名" }],
 *   "data": [{ "categoryKey": "S1", "value": 8 }, ...]
 * }
 */

export interface ChartSeriesDef {
  key: string
  label?: string
}

export interface ChartSpec {
  type: "bar" | "line" | "pie"
  title?: string
  x: string
  series: ChartSeriesDef[]
  data: Record<string, unknown>[]
}

const MAX_POINTS = 50
const MAX_SERIES = 5

/**
 * Parse + validate a chart block body. Returns null for anything invalid —
 * the caller falls back to a plain code block (also covers the streaming
 * window where the JSON is still incomplete).
 */
export function parseChartSpec(raw: string): ChartSpec | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>

  if (o.type !== "bar" && o.type !== "line" && o.type !== "pie") return null
  if (typeof o.x !== "string" || !o.x) return null
  if (!Array.isArray(o.data) || o.data.length === 0) return null
  if (!Array.isArray(o.series) || o.series.length === 0) return null

  const series: ChartSeriesDef[] = []
  for (const s of o.series.slice(0, MAX_SERIES)) {
    if (s && typeof s === "object" && typeof (s as Record<string, unknown>).key === "string") {
      const sk = s as Record<string, unknown>
      series.push({ key: sk.key as string, label: typeof sk.label === "string" ? sk.label : undefined })
    }
  }
  if (series.length === 0) return null

  const data = o.data
    .slice(0, MAX_POINTS)
    .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object")
  if (data.length === 0) return null

  return {
    type: o.type,
    title: typeof o.title === "string" ? o.title : undefined,
    x: o.x,
    series,
    data,
  }
}

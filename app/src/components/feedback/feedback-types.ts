/** Wire shapes the Lessons screen reads (GET /api/feedback/*; services/feedback/feedback.dto). */

export const LESSON_STATE_FILTERS = ["", "draft", "confirmed", "systemized", "retired"] as const

export interface LessonView {
  id: string
  signature: string
  scope: string
  state: string
  symptom: string
  cause: string | null
  fix: string | null
  verify: string | null
  evidence: string[]
  errorCode: string | null
  confidential: boolean
  hits: number
  resolvedCount: number
  lastSeenAt: string | null
  confirmedBy: { id: string; name: string } | null
  systemizedRef: string | null
}

export interface LessonListView {
  lessons: LessonView[]
  truncated: boolean
  canCurate: boolean
  curatable: Record<string, boolean>
}

export interface FailureHistoryView {
  id: string
  tool: string
  errorCode: string | null
  source: string
  branch: string | null
  repeatCount: number
  createdAt: string
  projectName: string | null
  excerpt: string
  resolution: { diffSummary: string; createdAt: string } | null
}

export interface MetricsView {
  windowDays: number
  reports: number
  recurrenceRate: number | null
  resolveMinutes: { withLesson: number | null; withoutLesson: number | null; withLessonCount: number; withoutLessonCount: number }
  systemizedRate: number | null
  top: Array<{ signature: string; signatureText: string; tool: string; errorCode: string | null; count: number; lessonState: string | null }>
}

export function parseLessonList(raw: unknown): LessonListView {
  const r = raw as Partial<LessonListView> | null
  return {
    lessons: Array.isArray(r?.lessons) ? r.lessons : [],
    truncated: r?.truncated === true,
    canCurate: r?.canCurate === true,
    curatable: r?.curatable && typeof r.curatable === "object" ? r.curatable : {},
  }
}

export function parseMetrics(raw: unknown): MetricsView | null {
  const m = (raw as { metrics?: MetricsView | null } | null)?.metrics
  return m && typeof m === "object" ? m : null
}

export function parseHistory(raw: unknown): FailureHistoryView[] {
  const f = (raw as { failures?: unknown } | null)?.failures
  return Array.isArray(f) ? (f as FailureHistoryView[]) : []
}

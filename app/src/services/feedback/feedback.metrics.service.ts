import { defaultDb, type Db } from "@/services/_shared/db"
import { curatesAnything, loadViewerAccess, type FeedbackViewer } from "./feedback.access"

/**
 * Dashboard numbers of the feedback loop (W11), over all projects, for curators only.
 *
 *  - recurrenceRate: reports in the window that are NOT the first ever report of their signature / all reports
 *  - time to resolve (minutes, mean of the window's resolutions): failures whose lesson was confirmed / systemized
 *    ("withLesson") vs the others ("withoutLesson") — shows whether lessons shorten the way back to green
 *  - systemizedRate: systemized / (confirmed + systemized)
 *  - top: the most frequent signatures of the window (the LLM-less weekly summary)
 * Everything is bounded (MAX_* constants); `truncated` says a bound was hit.
 */

export const METRICS_WINDOW_DAYS = 30
const MAX_SIGNATURES = 5000
const MAX_RESOLUTIONS = 2000
const TOP = 10
const DAY_MS = 86_400_000

export interface TopFailure {
  signature: string
  signatureText: string
  tool: string
  errorCode: string | null
  count: number
  lessonState: string | null
}

export interface FeedbackMetrics {
  windowDays: number
  reports: number
  distinctSignatures: number
  recurrences: number
  /** null when there were no reports. */
  recurrenceRate: number | null
  resolutions: number
  resolveMinutes: { withLesson: number | null; withoutLesson: number | null; withLessonCount: number; withoutLessonCount: number }
  lessons: { draft: number; confirmed: number; systemized: number; retired: number }
  systemizedRate: number | null
  top: TopFailure[]
  truncated: boolean
}

export interface RecurrenceInput {
  /** signature → reports inside the window */
  inWindow: ReadonlyMap<string, number>
  /** signature → time of its first report ever */
  firstEver: ReadonlyMap<string, Date>
  windowStart: Date
}

/** Pure: reports that are a 2nd-or-later occurrence of their signature (anywhere, any project). */
export function countRecurrences(i: RecurrenceInput): { reports: number; recurrences: number } {
  let reports = 0
  let recurrences = 0
  for (const [signature, n] of i.inWindow) {
    reports += n
    const first = i.firstEver.get(signature)
    const firstInWindow = first !== undefined && first.getTime() >= i.windowStart.getTime()
    recurrences += firstInWindow ? n - 1 : n
  }
  return { reports, recurrences }
}

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10)
const ratio = (a: number, b: number): number | null => (b === 0 ? null : Math.round((a / b) * 1000) / 1000)

/** null when the viewer curates nothing (the numbers span projects they may not see). */
export async function getFeedbackMetrics(viewer: FeedbackViewer, now: Date = new Date(), db: Db = defaultDb): Promise<FeedbackMetrics | null> {
  const access = await loadViewerAccess(db, viewer)
  if (!curatesAnything(access)) return null
  const windowStart = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS)

  const grouped = await db.failureEvent.groupBy({
    by: ["signature"],
    where: { createdAt: { gte: windowStart } },
    _count: { _all: true },
    orderBy: { signature: "asc" },
    take: MAX_SIGNATURES + 1,
  })
  const truncatedSignatures = grouped.length > MAX_SIGNATURES
  const inWindow = new Map(grouped.slice(0, MAX_SIGNATURES).map((g) => [g.signature, g._count._all]))
  const signatures = [...inWindow.keys()]
  const firsts = signatures.length
    ? await db.failureEvent.groupBy({ by: ["signature"], where: { signature: { in: signatures } }, _min: { createdAt: true }, orderBy: { signature: "asc" } })
    : []
  const firstEver = new Map(firsts.flatMap((f) => (f._min.createdAt ? [[f.signature, f._min.createdAt] as const] : [])))
  const { reports, recurrences } = countRecurrences({ inWindow, firstEver, windowStart })

  const resolutionRows = await db.lessonResolution.findMany({
    where: { createdAt: { gte: windowStart } },
    select: { createdAt: true, failureEvent: { select: { createdAt: true, signature: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_RESOLUTIONS + 1,
  })
  const truncatedResolutions = resolutionRows.length > MAX_RESOLUTIONS
  const resolutionSignatures = [...new Set(resolutionRows.map((r) => r.failureEvent.signature))]
  const sharedLessons = resolutionSignatures.length
    ? await db.lesson.findMany({ where: { signature: { in: resolutionSignatures }, state: { in: ["confirmed", "systemized"] } }, select: { signature: true, confirmedAt: true }, take: 5000 })
    : []
  const confirmedAtBySig = new Map<string, Date>()
  for (const l of sharedLessons) {
    if (!l.confirmedAt) continue
    const prev = confirmedAtBySig.get(l.signature)
    if (!prev || l.confirmedAt < prev) confirmedAtBySig.set(l.signature, l.confirmedAt)
  }
  const withLesson: number[] = []
  const withoutLesson: number[] = []
  for (const r of resolutionRows.slice(0, MAX_RESOLUTIONS)) {
    const minutes = (r.createdAt.getTime() - r.failureEvent.createdAt.getTime()) / 60_000
    if (minutes < 0) continue
    // The lesson counts only when it was already confirmed when the failure happened.
    const confirmedAt = confirmedAtBySig.get(r.failureEvent.signature)
    ;(confirmedAt && confirmedAt.getTime() <= r.failureEvent.createdAt.getTime() ? withLesson : withoutLesson).push(minutes)
  }

  const stateCounts = await db.lesson.groupBy({ by: ["state"], _count: { _all: true }, orderBy: { state: "asc" } })
  const lessons = { draft: 0, confirmed: 0, systemized: 0, retired: 0 }
  for (const s of stateCounts) if (s.state in lessons) lessons[s.state as keyof typeof lessons] = s._count._all

  const topSignatures = [...inWindow.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP)
  const latest = topSignatures.length
    ? await db.failureEvent.findMany({
        where: { signature: { in: topSignatures.map(([s]) => s) }, createdAt: { gte: windowStart } },
        select: { signature: true, signatureText: true, tool: true, errorCode: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : []
  const topLessons = topSignatures.length
    ? await db.lesson.findMany({ where: { signature: { in: topSignatures.map(([s]) => s) } }, select: { signature: true, state: true }, take: 200 })
    : []
  const top: TopFailure[] = topSignatures.map(([signature, count]) => {
    const f = latest.find((x) => x.signature === signature)
    const states = topLessons.filter((l) => l.signature === signature).map((l) => l.state)
    const lessonState = (["systemized", "confirmed", "draft", "retired"] as const).find((s) => states.includes(s)) ?? null
    return { signature, signatureText: f?.signatureText ?? "", tool: f?.tool ?? "", errorCode: f?.errorCode ?? null, count, lessonState }
  })

  return {
    windowDays: METRICS_WINDOW_DAYS,
    reports,
    distinctSignatures: inWindow.size,
    recurrences,
    recurrenceRate: ratio(recurrences, reports),
    resolutions: withLesson.length + withoutLesson.length,
    resolveMinutes: { withLesson: mean(withLesson), withoutLesson: mean(withoutLesson), withLessonCount: withLesson.length, withoutLessonCount: withoutLesson.length },
    lessons,
    systemizedRate: ratio(lessons.systemized, lessons.systemized + lessons.confirmed),
    top,
    truncated: truncatedSignatures || truncatedResolutions,
  }
}

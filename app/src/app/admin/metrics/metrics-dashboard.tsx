"use client"

import { useEffect, useMemo, type ReactNode } from "react"
import { Activity, RefreshCw } from "lucide-react"
import { Badge, Button, PageHeader, SkeletonCard, type BadgeTone } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useStableCallback } from "@/hooks/use-stable-callback"
import type { Translations } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { DANGER_COLOR, MetricsLineChart, WARNING_COLOR } from "./metrics-charts"
import {
  chartRows,
  formatClock,
  formatDuration,
  formatMs,
  formatPercent,
  type MetricsCurrent,
  type MetricsResponse,
} from "./metrics-format"

const URL = "/api/admin/metrics"
export const METRICS_REFRESH_MS = 30_000
const SLOW_ROUTE_ROWS = 15
/** Thresholds that turn a KPI amber / red. */
const ERROR_RATE_WARN = 0.01
const ERROR_RATE_BAD = 0.05
const P95_WARN_MS = 1000
const P95_BAD_MS = 3000

/** Call `fn` every `ms` while the tab is visible, and once when it becomes visible again. */
export function useVisibleInterval(fn: () => void, ms: number): void {
  const stable = useStableCallback(fn)
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") stable()
    }
    const timer = setInterval(tick, ms)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [ms, stable])
}

function tone(value: number | null, warn: number, bad: number): BadgeTone {
  if (value === null) return "neutral"
  if (value >= bad) return "danger"
  if (value >= warn) return "warning"
  return "success"
}

const TONE_TEXT: Record<BadgeTone, string> = {
  neutral: "text-fg",
  primary: "text-primary",
  success: "text-fg",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
}

function Kpi({ label, value, sub, valueTone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; valueTone?: BadgeTone }) {
  return (
    <div className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
      <dt className="text-caption font-medium text-fg-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${TONE_TEXT[valueTone]}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-caption text-fg-subtle">{sub}</dd>}
    </div>
  )
}

export function workerLabel(t: Translations, worker: MetricsCurrent["worker"]): { text: string; tone: BadgeTone } {
  const { status } = worker
  if (status === "ok") return { text: t.metricsWorkerOk, tone: "success" }
  // No heartbeat is normal when translations run in-process (A3-20): neutral, not a warning.
  if (status === "absent" && worker.expected === false) return { text: t.metricsWorkerInProcess, tone: "neutral" }
  if (status === "stale") return { text: t.metricsWorkerStale, tone: "danger" }
  return { text: t.metricsWorkerAbsent, tone: "warning" }
}

function KpiStrip({ current }: { current: MetricsCurrent }) {
  const { t } = useLanguage()
  const w = current.http.last5m
  const worker = workerLabel(t, current.worker)
  const ago = (sec: number | null) => (sec === null ? t.metricsNotAvailable : t.metricsSecondsAgo.replace("{sec}", String(sec)))
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label={t.metricsTitle}>
      <Kpi label={t.metricsUptime} value={formatDuration(current.process.uptimeSec)} sub={`PID ${current.process.pid} · ${current.process.heapUsedMb} MB`} />
      <Kpi label={t.metricsRequestsPerMin} value={w.perMinute} sub={t.metricsLast5m} />
      <Kpi label={t.metricsErrorRate} value={formatPercent(w.errorRate)} sub={`${w.errors} / ${w.count}`} valueTone={tone(w.count > 0 ? w.errorRate : null, ERROR_RATE_WARN, ERROR_RATE_BAD)} />
      <Kpi label={t.metricsP95} value={formatMs(w.p95)} sub={`p50 ${formatMs(w.p50)}`} valueTone={tone(w.p95, P95_WARN_MS, P95_BAD_MS)} />
      <Kpi
        label={t.metricsDbLatency}
        value={current.db.ok ? formatMs(current.db.latencyMs) : t.metricsDbDown}
        valueTone={current.db.ok ? "neutral" : "danger"}
      />
      <Kpi label={t.metricsWorker} value={<Badge tone={worker.tone} size="md">{worker.text}</Badge>} sub={ago(current.worker.heartbeatAgeSec)} />
    </dl>
  )
}

function QueuePanels({ current }: { current: MetricsCurrent }) {
  const { t } = useLanguage()
  const na = t.metricsNotAvailable
  const o = current.ai.ollama
  const jobs = current.ai.jobs
  const tr = current.translation
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-body font-medium tabular-nums text-fg">{value}</dd>
    </div>
  )
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section aria-labelledby="metrics-ai" className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
        <h2 id="metrics-ai" className="mb-2 text-body font-semibold text-fg">{t.metricsAiQueue}</h2>
        <dl className="divide-y divide-border">
          {row(t.metricsAiActive, o ? `${o.active} / ${o.max}` : na)}
          {row(t.metricsAiQueued, o ? o.queuedUser + o.queuedBackground : na)}
          {row(t.metricsAiWaitP95, formatMs(current.ai.wait5m.p95, na))}
          {row(t.metricsAiJobsQueued, jobs ? jobs.queued : na)}
          {row(t.metricsAiJobsRunning, jobs ? jobs.running : na)}
        </dl>
      </section>
      <section aria-labelledby="metrics-translation" className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
        <h2 id="metrics-translation" className="mb-2 text-body font-semibold text-fg">{t.metricsTranslationBacklog}</h2>
        <dl className="divide-y divide-border">
          {row(t.metricsTranslationPending, tr ? tr.pending : na)}
          {row(t.metricsTranslationOldest, tr ? formatDuration(tr.oldestPendingAgeSec, na) : na)}
        </dl>
      </section>
    </div>
  )
}

function SlowRoutes({ current }: { current: MetricsCurrent }) {
  const { t } = useLanguage()
  const routes = current.http.routes.slice(0, SLOW_ROUTE_ROWS)
  return (
    <section aria-labelledby="metrics-routes" className="rounded-ui-lg border border-border bg-surface shadow-ui-sm">
      <h2 id="metrics-routes" className="px-4 pt-4 text-body font-semibold text-fg">{t.metricsSlowRoutes}</h2>
      {routes.length === 0 ? (
        <p className="px-4 py-4 text-caption text-fg-muted">{t.metricsSlowRoutesEmpty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-body">
            <thead className="bg-surface-muted text-left text-caption text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{t.metricsColRoute}</th>
                <th scope="col" className="px-2 py-2 font-medium">{t.metricsColMethod}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t.metricsColCount}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t.metricsColErrors}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t.metricsColP50}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t.metricsColP95}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t.metricsColMax}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {routes.map((r) => (
                <tr key={`${r.method} ${r.route}`}>
                  <td className="px-4 py-1.5 font-mono text-caption break-all">{r.route}</td>
                  <td className="px-2 py-1.5 text-caption">{r.method}</td>
                  <td className="px-2 py-1.5 text-right">{r.count}</td>
                  <td className={`px-2 py-1.5 text-right ${r.errors > 0 ? "text-danger" : ""}`}>{r.errors}</td>
                  <td className="px-2 py-1.5 text-right">{formatMs(r.p50)}</td>
                  <td className={`px-2 py-1.5 text-right ${TONE_TEXT[tone(r.p95, P95_WARN_MS, P95_BAD_MS)]}`}>{formatMs(r.p95)}</td>
                  <td className="px-4 py-1.5 text-right">{formatMs(r.maxMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Admin metrics: KPI strip, queues, 24 h charts, slowest routes. Auto-refreshes every 30 s while visible. */
export function MetricsDashboard() {
  const { t, language } = useLanguage()
  const query = useApiQuery<MetricsResponse>(URL, { toastOnError: (e) => `${t.metricsLoadFailed}: ${e.message}` })
  const { data, refetch } = query
  useVisibleInterval(refetch, METRICS_REFRESH_MS)
  const rows = useMemo(() => chartRows(data?.history ?? [], language), [data?.history, language])

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.metricsTitle}
        description={t.metricsDescription}
        icon={
          <span className="block rounded-ui-md bg-primary p-2 text-primary-fg shadow-ui-sm">
            <Activity className="h-6 w-6" />
          </span>
        }
        actions={
          <div className="flex items-center gap-3">
            <span className="text-caption text-fg-muted" aria-live="polite">
              {data ? t.metricsUpdatedAt.replace("{time}", formatClock(data.current.takenAt, language)) : ""}
            </span>
            <Button variant="secondary" size="sm" onClick={refetch} loading={query.isFetching} leftIcon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              {t.metricsRefresh}
            </Button>
          </div>
        }
      />
      {!data ? (
        <div className="space-y-3">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : (
        <>
          <p className="text-caption text-fg-subtle">
            {t.metricsProcessNote.replace("{pid}", String(data.current.process.pid))} {t.metricsAutoRefresh}
          </p>
          <KpiStrip current={data.current} />
          <QueuePanels current={data.current} />
          {rows.length === 0 ? (
            <p className="rounded-ui-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-caption text-fg-muted">
              {t.metricsHistoryEmpty}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <MetricsLineChart
                title={t.metricsTrafficChart}
                rows={rows}
                series={[
                  { key: "rpm", label: t.metricsRequestsPerMin },
                  { key: "p95", label: `${t.metricsP95} (ms)`, right: true, color: WARNING_COLOR },
                ]}
              />
              <MetricsLineChart
                title={t.metricsAiQueue}
                rows={rows}
                series={[
                  { key: "aiActive", label: t.metricsAiActive },
                  { key: "aiQueued", label: t.metricsAiQueued, color: DANGER_COLOR },
                  { key: "aiWaitP95", label: `${t.metricsAiWaitP95} (ms)`, right: true, color: WARNING_COLOR },
                ]}
              />
              <MetricsLineChart
                title={t.metricsTranslationBacklog}
                rows={rows}
                series={[
                  { key: "translationPending", label: t.metricsTranslationPending },
                  { key: "aiJobsQueued", label: t.metricsAiJobsQueued },
                ]}
              />
            </div>
          )}
          <SlowRoutes current={data.current} />
        </>
      )}
    </div>
  )
}

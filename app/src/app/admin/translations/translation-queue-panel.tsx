"use client"

import { useEffect } from "react"
import { RefreshCw, RotateCcw } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { Button, PageHeader } from "@/components/ui"
import type { TranslationStats } from "@/lib/translation/types"
import { useDocumentTitle } from "@/hooks/use-document-title"

const REFRESH_MS = 5_000
const STATS_URL = "/api/admin/translations/stats"

/** Queue counters, worker / Ollama state, last error, retry-failed. Auto-refreshes. */
export function TranslationQueuePanel() {
  const { t } = useLanguage()
  useDocumentTitle([t.translationsTitle])
  // Polling errors are shown inline (not toasted) so a down server does not
  // raise a toast every 5 s; the last good stats stay visible.
  const { data: stats, error, isFetching, refetch } = useApiQuery<TranslationStats>(STATS_URL, {
    init: { cache: "no-store" },
  })

  useEffect(() => {
    const id = setInterval(refetch, REFRESH_MS)
    return () => clearInterval(id)
  }, [refetch])

  const retry = useApiMutation<void, { requeued: number }>(
    () => apiFetch<{ requeued: number }>("/api/admin/translations/retry-failed", { method: "POST" }),
    {
      toastOnError: true,
      toastOnSuccess: (res) => t.translationsRetried.replace("{count}", String(res.requeued)),
      onSuccess: () => refetch(),
    },
  )

  const workerLabel = (() => {
    if (!stats) return "—"
    switch (stats.workerLocation) {
      case "off":
        return t.translationsWorkerDisabled
      case "separate-process":
        // Idle / busy counters below belong to this web process, not the worker.
        return t.translationsWorkerExternal
      case "not-started":
        return t.translationsWorkerNotStarted
      default:
        if (stats.backgroundActive > 0) return t.translationsBackgroundActive
        return stats.workerIdle ? t.translationsWorkerIdle : t.translationsWorkerBusy
    }
  })()

  const counters: Array<{ key: string; label: string; value: number | undefined; tone: string }> = [
    { key: "pending", label: t.translationsPending, value: stats?.pending, tone: "text-warning-strong bg-warning-soft" },
    { key: "running", label: t.translationsRunning, value: stats?.running, tone: "text-primary-strong bg-primary-soft" },
    { key: "done", label: t.translationsDone, value: stats?.done, tone: "text-success-strong bg-success-soft" },
    { key: "failed", label: t.translationsFailed, value: stats?.failed, tone: "text-danger-strong bg-danger-soft" },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.translationsTitle}
        description={t.translationsHelp}
        className="mb-0"
        actions={
          <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} aria-busy={isFetching} onClick={refetch}>
            {t.translationsRefresh}
          </Button>
        }
      />
      <div className="bg-surface rounded-ui-md shadow-ui-sm border border-border p-5">
        {/* Polite live region: counter changes are announced without interrupting. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status" aria-live="polite" aria-atomic="true">
          {counters.map((c) => (
            <div key={c.key} className={`rounded-ui-sm px-4 py-3 ${c.tone}`}>
              <div className="text-caption font-medium">{c.label}</div>
              <div className="text-2xl font-semibold tabular-nums">{c.value ?? "—"}</div>
            </div>
          ))}
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-2 text-body sm:grid-cols-[auto_1fr]">
          <dt className="text-fg-muted">{t.translationsWorker}</dt>
          <dd className="text-fg">
            {workerLabel}
            {stats?.workerLocation === "separate-process" && (
              <p className="mt-0.5 text-caption text-fg-muted">{t.translationsWorkerExternalNote}</p>
            )}
          </dd>
          <dt className="text-fg-muted">{t.translationsOllama}</dt>
          <dd className={stats?.ollamaReachable ? "text-success" : "text-danger"}>
            {!stats ? "—" : stats.ollamaReachable ? t.translationsOllamaOk : t.translationsOllamaNg}
          </dd>
          <dt className="text-fg-muted">{t.translationsModel}</dt>
          <dd className="font-mono text-fg">{stats?.model ?? "—"}</dd>
          <dt className="text-fg-muted">{t.translationsLastError}</dt>
          <dd className="text-fg">
            {!stats ? (
              "—"
            ) : stats.lastError ? (
              <span className="text-danger">
                <span className="font-mono text-caption text-fg-muted">
                  {stats.lastError.entityType}/{stats.lastError.field} · {new Date(stats.lastError.at).toLocaleString()}
                </span>
                <br />
                {stats.lastError.error}
              </span>
            ) : (
              <span className="text-fg-subtle">{t.translationsNoError}</span>
            )}
          </dd>
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            leftIcon={<RotateCcw className="h-4 w-4" />}
            loading={retry.isPending}
            onClick={() => void retry.mutate()}
            disabled={!stats || stats.failed === 0}
          >
            {t.translationsRetryFailed}
          </Button>
          {error && (
            <span role="alert" className="text-body text-danger">
              {error.message}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

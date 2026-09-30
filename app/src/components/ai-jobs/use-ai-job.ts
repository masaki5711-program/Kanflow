"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "@/components/ui"
import { apiFetch, isAbortError } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { emitAiReportsChanged, isJobActive, isJobsDisabledError, jobUrl, jobsUrl, type AiJobView } from "./ai-job-client"

/** How often the button chip re-reads an active job. */
export const JOB_POLL_MS = 4000

interface UseAiReportJobOptions {
  projectId: string
  /** No job runner on the server: show the report synchronously instead. */
  onFallback: () => void
}

/**
 * Request a background progress report and follow it until it finishes.
 * The server notifies the requester too (bell), so leaving the page is fine.
 */
export function useAiReportJob({ projectId, onFallback }: UseAiReportJobOptions) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const [job, setJob] = useState<AiJobView | null>(null)
  const [starting, setStarting] = useState(false)
  const onFallbackRef = useRef(onFallback)
  useEffect(() => {
    onFallbackRef.current = onFallback
  })

  const start = useCallback(async () => {
    setStarting(true)
    try {
      const res = await apiFetch<{ job: AiJobView; deduped: boolean }>(jobsUrl(projectId), {
        method: "POST",
        json: { kind: "progress_report", lang: language },
      })
      setJob(res.job)
      toast.info(res.deduped ? t.aiJobAlreadyRunning : t.aiJobStarted)
    } catch (err) {
      if (isJobsDisabledError(err)) onFallbackRef.current()
      else toast.error(t.aiJobStartFailed)
    } finally {
      setStarting(false)
    }
  }, [projectId, language, toast, t])

  const active = isJobActive(job)
  const jobId = job?.id ?? null

  // Follow an active job until it is done / failed / cancelled.
  useEffect(() => {
    if (!active || !jobId) return
    const controller = new AbortController()
    const timer = setInterval(() => {
      apiFetch<AiJobView>(jobUrl(projectId, jobId), { signal: controller.signal })
        .then((next) => {
          setJob(next)
          if (next.status === "done") {
            toast.success(t.aiJobDone)
            emitAiReportsChanged()
          } else if (next.status === "failed") {
            toast.error(t.aiJobFailed)
          }
        })
        .catch((err: unknown) => {
          if (!isAbortError(err)) return // transient: the next poll retries
        })
    }, JOB_POLL_MS)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [active, jobId, projectId, toast, t])

  return { job, starting, active, start }
}

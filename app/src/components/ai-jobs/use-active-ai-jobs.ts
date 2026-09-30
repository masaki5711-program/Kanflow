"use client"

import { useEffect, useRef } from "react"
import { useApiQuery } from "@/hooks"
import { AI_REPORTS_CHANGED_EVENT, jobsUrl, toJobList, type AiJobView } from "./ai-job-client"

/** Re-read the in-progress list this often while something is queued / running. */
export const ACTIVE_JOBS_POLL_MS = 8000

/**
 * Queued / running report jobs of a project (GET /ai/jobs), polled while
 * any exist. `onJobFinished` fires when a listed job disappears from the
 * list (done / failed / cancelled) so the caller can reload the reports.
 */
export function useActiveAiJobs(projectId: string, onJobFinished: () => void): AiJobView[] {
  const query = useApiQuery<AiJobView[]>(jobsUrl(projectId), { parse: toJobList })
  const jobs = Array.isArray(query.data) ? toJobList({ items: query.data }) : []
  const { refetch } = query
  const count = jobs.length
  const ids = jobs.map((j) => j.id).join(",")

  const onFinishedRef = useRef(onJobFinished)
  useEffect(() => {
    onFinishedRef.current = onJobFinished
  })

  // Poll while jobs are in progress.
  useEffect(() => {
    if (count === 0) return
    const timer = setInterval(() => refetch(), ACTIVE_JOBS_POLL_MS)
    return () => clearInterval(timer)
  }, [count, refetch])

  // A job left the list → its report (if any) now exists.
  const previousIds = useRef<string[]>([])
  useEffect(() => {
    const now = ids ? ids.split(",") : []
    if (previousIds.current.some((id) => !now.includes(id))) onFinishedRef.current()
    previousIds.current = now
  }, [ids])

  // A job requested on this page (dashboard button) → show it at once.
  useEffect(() => {
    const onChanged = () => refetch()
    window.addEventListener(AI_REPORTS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(AI_REPORTS_CHANGED_EVENT, onChanged)
  }, [refetch])

  return jobs
}

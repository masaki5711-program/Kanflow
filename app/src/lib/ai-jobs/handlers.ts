import { normalizeLang } from "@/lib/ai-analysis"
import { aiLog } from "@/lib/ai-monitor"
import { buildProjectContext } from "@/lib/project-context"
import { PROGRESS_REPORT_TITLE, buildProgressReportMessages, generateProgressReport } from "@/lib/progress-report"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { saveReport } from "@/services/ai-reports/ai-reports.service"
import { runSprintCompletionReview } from "@/services/sprints/sprint-completion-review"
import type { AiJobKind } from "./config"
import type { AiJobHandler, ClaimedJob, JobContext, JobResult } from "./runner"

/**
 * Job kinds → handlers. Each produces and stores one AiReport and returns
 * its id; the runner marks the job done and notifies the requester.
 */

/** Progress report (the dashboard button): same prompt as the streaming endpoint, stored as trigger "manual". */
export async function runProgressReportJob(job: ClaimedJob, ctx: JobContext): Promise<JobResult> {
  const t0 = Date.now()
  const lang = normalizeLang(job.params.lang)
  await ctx.progress(5)
  const context = await buildProjectContext(job.projectId)
  await ctx.progress(20)
  const report = await generateProgressReport(buildProgressReportMessages(context, lang), {
    signal: ctx.signal,
    label: `progress-report-job:${job.id}`,
  })
  await ctx.progress(90)
  const title = PROGRESS_REPORT_TITLE[lang]
  const saved = await saveReport({
    projectId: job.projectId,
    trigger: "manual",
    status: "done",
    title,
    summary: report.headline.slice(0, 500),
    body: structuredReportToMarkdown(report, lang),
    structured: JSON.stringify(report),
    meta: JSON.stringify({ jobId: job.id, kind: job.kind, lang, requestedBy: job.userId, durationMs: Date.now() - t0 }),
  })
  aiLog("REPORT_SAVED", `progress-report job ${job.id}: AiReport ${saved.id} saved`)
  return { reportId: saved.id, title }
}

/** Sprint completion review (queued when a sprint is completed). */
export async function runSprintReviewJob(job: ClaimedJob, ctx: JobContext): Promise<JobResult> {
  const sprintId = typeof job.params.sprintId === "string" ? job.params.sprintId : ""
  const sprintName = typeof job.params.sprintName === "string" ? job.params.sprintName : sprintId
  if (!sprintId) throw new Error("sprint_review job without sprintId")
  await ctx.progress(10)
  return runSprintCompletionReview(job.projectId, sprintId, sprintName, ctx.signal)
}

export const AI_JOB_HANDLERS: Readonly<Record<AiJobKind, AiJobHandler>> = {
  progress_report: runProgressReportJob,
  sprint_review: runSprintReviewJob,
}

import { runAgentInvestigation } from "@/lib/ai-agent"
import { aiLog } from "@/lib/ai-monitor"
import { aiJobsEnabled } from "@/lib/ai-jobs/config"
import { bilingualizeReportBody, bilingualizeStructuredReport } from "@/lib/report-bilingual"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { saveReplacingPrevious } from "@/services/ai-reports/ai-reports.service"
import { enqueueAiJob } from "@/services/ai-jobs/ai-jobs.service"

/**
 * Event trigger (IoT pilot pattern): when a sprint is completed, an
 * autonomous AI review is produced without delaying the PATCH response.
 *
 * - With a background job runner (worker, or in-process — lib/ai-jobs) the
 *   review is queued as an AiJob (kind `sprint_review`, one per sprint) and
 *   the user who completed the sprint is notified when it is ready.
 * - Without one (AI_JOB_RUNNER / AI_TRANSLATION_WORKER = off) it runs
 *   fire-and-forget inside this process, as before.
 *
 * Failures are logged, never surfaced to the PATCH. The review is generated
 * in Japanese and rendered as JA/ID bilingual line pairs, matching the
 * surveillance reports.
 */
export function launchSprintCompletionReview(
  projectId: string,
  sprintId: string,
  sprintName: string,
  requesterId: string | null = null
): void {
  const onError = (err: unknown) => {
    aiLog("CHAT_ERROR", `sprint-completed review failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (aiJobsEnabled(process.env)) {
    void enqueueAiJob({ projectId, userId: requesterId, kind: "sprint_review", params: { sprintId, sprintName }, scope: sprintId })
      .then(({ job, deduped }) => aiLog("SURVEIL", `sprint-completed:${sprintName}: review ${deduped ? "already queued" : "queued"} as job ${job.id}`))
      .catch(onError)
    return
  }
  void runSprintCompletionReview(projectId, sprintId, sprintName).catch(onError)
}

/** Generate and store the review (job handler and the in-process fallback). */
export async function runSprintCompletionReview(
  projectId: string,
  sprintId: string,
  sprintName: string,
  signal?: AbortSignal
): Promise<{ reportId: string; title: string }> {
  const goal = `スプリント「${sprintName}」が完了した。ツールで実績（消化SP・タスク完了状況・担当者負荷・デイリースクラム）とベロシティ履歴を調査し、完了レビューをレポートせよ。次スプリントのキャパシティ目安も実績に基づいて提案すること。`
  const result = await runAgentInvestigation({ projectId, goal, lang: "ja", label: `sprint-completed:${sprintName}`, signal })

  aiLog("SURVEIL", `sprint-completed:${sprintName}: bilingualizing report`)
  const structured = result.structured ? await bilingualizeStructuredReport(result.structured, signal) : null
  const body = structured ? structuredReportToMarkdown(structured, "ja") : await bilingualizeReportBody(result.report, signal)

  // Keep only the newest completion review per project. (The active
  // surveillance warning is left alone — the next daily run follows it up.)
  const title = `🏁 スプリント完了レビュー / Tinjauan penyelesaian sprint: ${sprintName}`
  const saved = await saveReplacingPrevious({
    projectId,
    trigger: "sprint_completed",
    status: "done",
    title,
    summary: structured?.headline.slice(0, 500) ?? null,
    body,
    structured: structured ? JSON.stringify(structured) : null,
    meta: JSON.stringify({
      sprintId,
      toolCalls: result.toolCalls,
      iterations: result.iterations,
      durationMs: result.ms,
    }),
  })
  if (saved.superseded > 0) {
    aiLog("SURVEIL", `sprint-completed:${sprintName}: superseded ${saved.superseded} previous review(s)`)
  }
  aiLog("REPORT_SAVED", `sprint-completed:${sprintName}: AiReport ${saved.id} saved`)
  return { reportId: saved.id, title }
}

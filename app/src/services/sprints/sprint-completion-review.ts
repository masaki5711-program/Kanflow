import { runAgentInvestigation } from "@/lib/ai-agent"
import { aiLog } from "@/lib/ai-monitor"
import { bilingualizeReportBody, bilingualizeStructuredReport } from "@/lib/report-bilingual"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { saveReplacingPrevious } from "@/services/ai-reports/ai-reports.service"

/**
 * Event trigger (IoT pilot pattern): when a sprint is completed, launch an
 * autonomous AI review in the background — fire-and-forget so the PATCH
 * response is not delayed. Failures are logged, never surfaced to the user.
 * The review is generated in Japanese and then rendered as JA/ID bilingual
 * line pairs, matching the surveillance reports.
 */
export function launchSprintCompletionReview(projectId: string, sprintId: string, sprintName: string): void {
  void runSprintCompletionReview(projectId, sprintId, sprintName).catch((err: unknown) => {
    aiLog("CHAT_ERROR", `sprint-completed review failed: ${err instanceof Error ? err.message : String(err)}`)
  })
}

async function runSprintCompletionReview(projectId: string, sprintId: string, sprintName: string): Promise<void> {
  const goal = `スプリント「${sprintName}」が完了した。ツールで実績（消化SP・タスク完了状況・担当者負荷・デイリースクラム）とベロシティ履歴を調査し、完了レビューをレポートせよ。次スプリントのキャパシティ目安も実績に基づいて提案すること。`
  const result = await runAgentInvestigation({ projectId, goal, lang: "ja", label: `sprint-completed:${sprintName}` })

  aiLog("SURVEIL", `sprint-completed:${sprintName}: bilingualizing report`)
  const structured = result.structured ? await bilingualizeStructuredReport(result.structured) : null
  const body = structured ? structuredReportToMarkdown(structured, "ja") : await bilingualizeReportBody(result.report)

  // Keep only the newest completion review per project. (The active
  // surveillance warning is left alone — the next daily run follows it up.)
  const saved = await saveReplacingPrevious({
    projectId,
    trigger: "sprint_completed",
    status: "done",
    title: `🏁 スプリント完了レビュー / Tinjauan penyelesaian sprint: ${sprintName}`,
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
}

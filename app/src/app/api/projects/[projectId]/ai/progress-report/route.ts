import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { analysisStreamResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import { buildProjectContext } from "@/lib/project-context"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { PROGRESS_REPORT_OPTIONS, buildProgressReportMessages } from "@/lib/progress-report"

/**
 * Stakeholder progress report — structured AND streamed (synchronous path).
 *
 * The raw JSON tokens are streamed to the client, which incrementally parses
 * them (streaming-json-array.ts) and live-renders the formal report document
 * section by section. The prompt lives in lib/progress-report.ts, shared with
 * the background job (POST /ai/jobs, kind "progress_report"), which the
 * dashboard uses whenever a job runner exists; this endpoint stays for
 * AI_TRANSLATION_WORKER=off / AI_JOB_RUNNER=off and as the fallback.
 */

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await requireProject(projectId, "ai.use")
  if ("error" in auth) return auth.error

  let lang: AILang = "ja"
  try {
    const json = await request.json().catch(() => ({}))
    const parsed = bodySchema.parse(json)
    lang = normalizeLang(parsed?.lang)
  } catch { /* default ja */ }

  const context = await buildProjectContext(projectId)

  return analysisStreamResponse(buildProgressReportMessages(context, lang), {
    temperature: PROGRESS_REPORT_OPTIONS.temperature,
    format: "json",
    numPredict: PROGRESS_REPORT_OPTIONS.numPredict,
    label: "progress-report",
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
  })
}

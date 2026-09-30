import { prisma } from "@/lib/prisma"
import { detectAnomalies, type Anomaly } from "@/lib/surveillance"
import { runAgentInvestigation } from "@/lib/ai-agent"
import { bilingualizeStructuredReport, bilingualizeReportBody, convertLegacyAiReports } from "@/lib/report-bilingual"
import { resolveAiReportRetentionDays } from "@/lib/ai-report-retention"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { hasJapanese } from "@/lib/bilingual-detect"
import type { StructuredReport } from "@/lib/report-tool"
import { aiLog } from "@/lib/ai-monitor"
import { acquireNamedLock, type TxRunner } from "@/worker/named-lock"
import type { Db } from "@/services/_shared/db"
import { notify, projectMemberIds } from "@/services/_shared/notifications"

/**
 * Daily AI surveillance run (moved out of the HTTP route).
 *
 * Per active project: deterministic checks + the previous report's findings
 * → autonomous agent verifies yesterday's advice (followUps) and analyses
 * today's anomalies → ONE bilingual (JA/ID) report.
 *
 * History is kept: reports are no longer superseded (deleted) per project;
 * only reports older than SURVEILLANCE_RETENTION_DAYS (alias
 * AI_REPORT_RETENTION_DAYS, default 90) are removed — this sweep is the only
 * AiReport deletion. Each run then converts a batch of legacy single-language
 * reports to JA/ID bilingual (best effort). A MySQL named lock makes the
 * run exclusive across processes (web manual trigger vs. worker schedule).
 *
 * Cost guards: agent runs only when anomalies or follow-up items exist, and
 * at most MAX_INVESTIGATIONS projects are investigated per run.
 */

export const MAX_INVESTIGATIONS = 3
export const SURVEILLANCE_LOCK_NAME = "kanflow_surveillance"
/** Upper bound on one run holding the cross-process lock. */
const RUN_LOCK_HOLD_MS = 3 * 60 * 60_000
const DAY_MS = 86_400_000

export interface ProjectResult {
  project: string
  anomalies?: number
  investigated?: boolean
  reportId?: string
  skipped?: string
  error?: string
}

export interface SurveillanceResult {
  status: "done" | "skipped" | "aborted"
  reason?: string
  projects: ProjectResult[]
  investigated: number
  retention: { days: number; deleted: number }
  conversion: { converted: number }
}

export interface RunSurveillanceOptions {
  signal?: AbortSignal
  /** Awaited before each investigation (the worker waits for busy web users here). */
  beforeInvestigation?: (signal?: AbortSignal) => Promise<void>
  retentionDays?: number
  now?: () => Date
}

/** Reports created before this instant are deleted by retention. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

export async function pruneOldReports(days: number, now: Date): Promise<number> {
  const cutoff = retentionCutoff(now, days)
  const { count } = await prisma.aiReport.deleteMany({ where: { createdAt: { lt: cutoff } } })
  if (count > 0) aiLog("SURVEIL", `report retention: deleted ${count} report(s) older than ${days} days`)
  return count
}

/**
 * Previous report's open findings + recommended actions as plain Japanese
 * lines for the follow-up goal (bilingual fields: keep only the JA lines).
 */
export function extractPreviousFindings(structuredJson: string | null, summary: string | null): string[] {
  const jaOnly = (s: string) => {
    const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const ja = lines.filter(hasJapanese)
    return (ja.length > 0 ? ja : lines).join(" ")
  }
  if (structuredJson) {
    try {
      const r = JSON.parse(structuredJson) as StructuredReport
      const out: string[] = []
      for (const f of r.findings ?? []) {
        out.push(`- [${f.severity}] ${jaOnly(f.title)}${f.detail ? `（${jaOnly(f.detail)}）` : ""}`)
      }
      for (const fu of r.followUps ?? []) {
        if (fu.status !== "resolved") out.push(`- [継続] ${jaOnly(fu.item)}`)
      }
      for (const a of r.actions ?? []) {
        out.push(`- [推奨アクション] ${jaOnly(a.action)}`)
      }
      return out.slice(0, 15)
    } catch {
      /* fall through to summary */
    }
  }
  return summary ? [`- ${jaOnly(summary)}`] : []
}

export function buildGoal(previousFindings: string[], previousDate: Date | null, anomalies: Anomaly[]): string {
  const parts: string[] = []
  if (previousFindings.length > 0 && previousDate) {
    parts.push(
      `# 前回の報告（${previousDate.toISOString().slice(0, 10)}）の指摘事項\n${previousFindings.join("\n")}\n\n` +
        `上記の各指摘について、ツールで現状を確認し、対応状況を submit_report の followUps に必ず記載せよ（status: resolved=解消済み / improved=改善中 / unresolved=未対応。note に根拠となる数値を書く）。`
    )
  }
  if (anomalies.length > 0) {
    parts.push(`# 本日検知された異常\n${anomalies.map((a) => `- [${a.severity}] ${a.description}`).join("\n")}`)
  } else {
    parts.push(`本日の定期チェックでは新たな異常は検知されていない。`)
  }
  parts.push(`以上を踏まえて調査し、前回指摘のフォローアップ結果と本日の新規分析を統合した「本日の評価報告書」を submit_report で提出せよ。`)
  return parts.join("\n\n")
}

function reportTitle(anomalies: Anomaly[]): string {
  if (anomalies.length === 0) return `🟢 定期監視: 前回指摘のフォローアップ / Pemantauan rutin: tindak lanjut temuan sebelumnya`
  const icon = anomalies.some((a) => a.severity === "critical") ? "🔴" : "🟡"
  return `${icon} 定期監視: 異常${anomalies.length}件の自動調査 / Pemantauan rutin: investigasi otomatis ${anomalies.length} anomali`
}

/** Critical anomalies listed in a notification payload (the report has the rest). */
const NOTIFY_ANOMALY_LIMIT = 5

/**
 * A report with critical anomalies notifies the project's PO / SM once per
 * report (dedupeKey). Never throws (notify() absorbs failures).
 */
export async function notifySurveillanceCritical(
  project: { id: string; name: string },
  report: { id: string; title: string },
  anomalies: readonly Anomaly[],
  db: Db = prisma
): Promise<number> {
  const critical = anomalies.filter((a) => a.severity === "critical")
  if (critical.length === 0) return 0
  return notify(db, {
    recipientIds: await projectMemberIds(db, project.id, ["po", "sm"]),
    type: "surveillance_critical",
    projectId: project.id,
    entityType: "ai_report",
    entityId: report.id,
    payload: {
      reportId: report.id,
      title: report.title,
      projectName: project.name,
      criticalCount: critical.length,
      anomalies: critical.slice(0, NOTIFY_ANOMALY_LIMIT).map((a) => a.description),
    },
    dedupeKey: `surveillance_critical:${report.id}`,
  })
}

interface Investigation {
  project: { id: string; name: string }
  anomalies: Anomaly[]
  previous: { id: string; createdAt: Date } | null
  previousFindings: string[]
  signal?: AbortSignal
}

async function investigate(inv: Investigation): Promise<string> {
  const { project: p, anomalies, previous, previousFindings, signal } = inv
  const result = await runAgentInvestigation({
    projectId: p.id,
    goal: buildGoal(previousFindings, previous?.createdAt ?? null, anomalies),
    lang: "ja",
    label: `surveillance:${p.name}`,
    signal,
  })
  aiLog("SURVEIL", `${p.name}: bilingualizing report`)
  const structured = result.structured ? await bilingualizeStructuredReport(result.structured, signal) : null
  const body = structured ? structuredReportToMarkdown(structured, "ja") : await bilingualizeReportBody(result.report, signal)
  const fallbackSummary =
    anomalies.length > 0 ? anomalies.map((a) => a.description).join(" / ") : "前回指摘のフォローアップ / Tindak lanjut temuan sebelumnya"
  const report = await prisma.aiReport.create({
    data: {
      projectId: p.id,
      trigger: "surveillance",
      status: "done",
      title: reportTitle(anomalies),
      summary: (structured?.headline ?? fallbackSummary).slice(0, 500),
      body,
      structured: structured ? JSON.stringify(structured) : null,
      meta: JSON.stringify({
        anomalies,
        followUpOf: previous?.id ?? null,
        toolCalls: result.toolCalls,
        iterations: result.iterations,
        durationMs: result.ms,
      }),
    },
  })
  aiLog("REPORT_SAVED", `${p.name}: AiReport ${report.id} saved (${result.report.length} chars)`)
  await notifySurveillanceCritical(p, report, anomalies)
  return report.id
}

async function surveyProject(
  p: { id: string; name: string },
  budgetLeft: boolean,
  opts: RunSurveillanceOptions
): Promise<ProjectResult> {
  const anomalies = await detectAnomalies(p.id)
  // Any trigger counts as "previous" — sprint reviews are followed up too.
  const previous = await prisma.aiReport.findFirst({
    where: { projectId: p.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, structured: true, summary: true, createdAt: true },
  })
  const previousFindings = previous ? extractPreviousFindings(previous.structured, previous.summary) : []
  if (anomalies.length === 0 && previousFindings.length === 0) {
    aiLog("SURVEIL", `${p.name}: OK (no anomalies, nothing to follow up)`)
    return { project: p.name, anomalies: 0, investigated: false }
  }
  if (!budgetLeft) {
    return { project: p.name, anomalies: anomalies.length, investigated: false, skipped: "max investigations reached" }
  }
  aiLog("SURVEIL", `${p.name}: ${anomalies.length} anomaly(ies), ${previousFindings.length} follow-up item(s) → launching autonomous investigation`)
  await opts.beforeInvestigation?.(opts.signal)
  const reportId = await investigate({ project: p, anomalies, previous, previousFindings, signal: opts.signal })
  return { project: p.name, anomalies: anomalies.length, investigated: true, reportId }
}

/** Legacy report conversion; failures never abort the surveillance run. */
async function convertLegacy(opts: RunSurveillanceOptions): Promise<number> {
  try {
    const { converted } = await convertLegacyAiReports({ signal: opts.signal, beforeConvert: opts.beforeInvestigation })
    return converted
  } catch (err) {
    aiLog("CHAT_ERROR", `legacy report conversion failed: ${err instanceof Error ? err.message : String(err)}`)
    return 0
  }
}

async function runLocked(opts: RunSurveillanceOptions, retentionDays: number): Promise<SurveillanceResult> {
  const now = opts.now ?? (() => new Date())
  const deleted = await pruneOldReports(retentionDays, now())
  const conversion = { converted: await convertLegacy(opts) }
  const projects = await prisma.project.findMany({
    where: { status: "active", deletedAt: null },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  })
  aiLog("SURVEIL", `daily surveillance started: ${projects.length} active project(s)`)
  const results: ProjectResult[] = []
  let investigated = 0
  for (const p of projects) {
    if (opts.signal?.aborted) {
      aiLog("SURVEIL", `daily surveillance aborted after ${investigated} investigation(s)`)
      return { status: "aborted", projects: results, investigated, retention: { days: retentionDays, deleted }, conversion }
    }
    try {
      const r = await surveyProject(p, investigated < MAX_INVESTIGATIONS, opts)
      if (r.investigated) investigated++
      results.push(r)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      aiLog("CHAT_ERROR", `surveillance ${p.name}: ${msg}`)
      results.push({ project: p.name, error: msg })
    }
  }
  aiLog("SURVEIL", `daily surveillance finished: ${investigated} investigation(s) launched`)
  return { status: "done", projects: results, investigated, retention: { days: retentionDays, deleted }, conversion }
}

const lockClient: TxRunner = {
  $transaction: (fn, options) => prisma.$transaction((tx) => fn(tx), options),
}

/** Run one surveillance pass, exclusive across processes. */
export async function runSurveillance(opts: RunSurveillanceOptions = {}): Promise<SurveillanceResult> {
  const retentionDays = opts.retentionDays ?? resolveAiReportRetentionDays(process.env)
  const lock = await acquireNamedLock(lockClient, SURVEILLANCE_LOCK_NAME, { holdMs: RUN_LOCK_HOLD_MS })
  if (!lock) {
    aiLog("SURVEIL", "skipped: a surveillance run is already in progress in another process")
    return { status: "skipped", reason: "running in another process", projects: [], investigated: 0, retention: { days: retentionDays, deleted: 0 }, conversion: { converted: 0 } }
  }
  try {
    return await runLocked(opts, retentionDays)
  } finally {
    await lock.release()
  }
}

import type { StructuredReport, ReportSeverity, ActionPriority, FollowUpStatus } from "@/lib/report-tool"
import type { AILang } from "@/lib/ai-analysis"

/**
 * Markdown rendering of a StructuredReport.
 *
 * Standalone module with type-only imports (no zod) so it is safe to use
 * from client components (copy-to-clipboard) as well as server code
 * (AiReport.body fallback written by the autonomous agent).
 */

const MD_LABELS: Record<AILang, Record<string, string>> = {
  ja: {
    overview: "概要", followUps: "前回指摘の対応状況", findings: "検知事項", metrics: "主要指標",
    causes: "原因分析", actions: "推奨アクション", outlook: "今後の見通し",
    label: "項目", value: "値",
  },
  en: {
    overview: "Overview", followUps: "Follow-up on previous findings", findings: "Findings", metrics: "Key metrics",
    causes: "Cause analysis", actions: "Recommended actions", outlook: "Outlook",
    label: "Item", value: "Value",
  },
  id: {
    overview: "Ringkasan", followUps: "Tindak lanjut temuan sebelumnya", findings: "Temuan", metrics: "Metrik utama",
    causes: "Analisis penyebab", actions: "Tindakan yang disarankan", outlook: "Prospek",
    label: "Item", value: "Nilai",
  },
}

const SEVERITY_MARK: Record<ReportSeverity, string> = { critical: "🔴", warning: "🟡", info: "🟢" }
const PRIORITY_MARK: Record<ActionPriority, string> = { high: "⚡", medium: "▶", low: "・" }
const FOLLOWUP_MARK: Record<FollowUpStatus, string> = { resolved: "✅", improved: "🔼", unresolved: "❌" }

export function structuredReportToMarkdown(report: StructuredReport, lang: AILang): string {
  const L = MD_LABELS[lang]
  const parts: string[] = [`**${report.headline}**`, "", `## ${L.overview}`, report.overview]

  if ((report.followUps ?? []).length > 0) {
    parts.push("", `## ${L.followUps}`)
    for (const f of report.followUps) {
      parts.push(`- ${FOLLOWUP_MARK[f.status]} ${f.item}${f.note ? ` — ${f.note}` : ""}`)
    }
  }
  if (report.findings.length > 0) {
    parts.push("", `## ${L.findings}`)
    for (const f of report.findings) {
      parts.push(`- ${SEVERITY_MARK[f.severity]} **${f.title}**${f.detail ? ` — ${f.detail}` : ""}`)
    }
  }
  if (report.metrics.length > 0) {
    parts.push("", `## ${L.metrics}`, `| ${L.label} | ${L.value} |`, "| --- | --- |")
    for (const m of report.metrics) parts.push(`| ${m.label} | ${m.value} |`)
  }
  if (report.causes.length > 0) {
    parts.push("", `## ${L.causes}`)
    for (const c of report.causes) parts.push(`- ${c}`)
  }
  if (report.actions.length > 0) {
    parts.push("", `## ${L.actions}`)
    for (const a of report.actions) parts.push(`- ${PRIORITY_MARK[a.priority]} ${a.action}`)
  }
  if (report.outlook) parts.push("", `## ${L.outlook}`, report.outlook)

  return parts.join("\n")
}

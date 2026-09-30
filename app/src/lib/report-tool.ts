import { z } from "zod"
import type { ToolDefinition } from "@/lib/chat-tools-types"

/**
 * Reporting tool for the autonomous agent (MCP-style, terminal tool).
 *
 * Instead of ending the investigation with a free-form markdown blob, the
 * agent finishes by CALLING submit_report with structured fields. The loop
 * in ai-agent.ts treats a valid submit_report call as the end of the run,
 * persists the structured JSON on AiReport.structured, and renders a formal
 * report document in the dashboard (ai-reports-panel).
 *
 * Design constraints for the local model (small Ollama models):
 * - flat schema, few required fields (headline + overview only)
 * - lenient normalization: sloppy entries are coerced/dropped, not rejected,
 *   so the agent doesn't burn iterations on schema retries
 */

export const REPORT_SEVERITIES = ["info", "warning", "critical"] as const
export const ACTION_PRIORITIES = ["high", "medium", "low"] as const
export const FOLLOWUP_STATUSES = ["resolved", "improved", "unresolved"] as const

export type ReportSeverity = (typeof REPORT_SEVERITIES)[number]
export type ActionPriority = (typeof ACTION_PRIORITIES)[number]
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number]

export interface StructuredReport {
  headline: string
  overview: string
  /** Follow-up verdicts on the PREVIOUS report's findings (surveillance only). */
  followUps: { status: FollowUpStatus; item: string; note: string | null }[]
  findings: { severity: ReportSeverity; title: string; detail: string | null }[]
  metrics: { label: string; value: string }[]
  causes: string[]
  actions: { priority: ActionPriority; action: string }[]
  outlook: string | null
}

export const SUBMIT_REPORT_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "submit_report",
    description:
      "Submit the final investigation report in structured form. Call this EXACTLY ONCE, as your LAST action, after you have gathered enough facts with the other tools. Do not write the report as plain text — always submit it through this tool.",
    parameters: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          description: "One-sentence conclusion of the investigation (max ~120 chars).",
        },
        overview: {
          type: "string",
          description: "Short prose summary of the situation (2-4 sentences).",
        },
        followUps: {
          type: "array",
          description:
            "ONLY when the goal lists findings from a previous report: one entry per previous finding stating whether it has been addressed, verified with tools.",
          items: {
            type: "object",
            properties: {
              status: { type: "string", enum: [...FOLLOWUP_STATUSES] },
              item: { type: "string", description: "The previous finding being followed up." },
              note: { type: "string", description: "Evidence from tool results for the verdict." },
            },
            required: ["status", "item"],
          },
        },
        findings: {
          type: "array",
          description: "Concrete facts discovered during the investigation.",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: [...REPORT_SEVERITIES] },
              title: { type: "string", description: "Short label of the finding." },
              detail: { type: "string", description: "Supporting detail with numbers quoted from tool results." },
            },
            required: ["severity", "title"],
          },
        },
        metrics: {
          type: "array",
          description: "Key numbers quoted VERBATIM from tool results (e.g. completed SP, task counts).",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["label", "value"],
          },
        },
        causes: {
          type: "array",
          description: "Probable causes, most likely first.",
          items: { type: "string" },
        },
        actions: {
          type: "array",
          description: "Recommended actions (2-4 items).",
          items: {
            type: "object",
            properties: {
              priority: { type: "string", enum: [...ACTION_PRIORITIES] },
              action: { type: "string" },
            },
            required: ["priority", "action"],
          },
        },
        outlook: {
          type: "string",
          description: "Optional short outlook / what to watch next.",
        },
      },
      required: ["headline", "overview"],
    },
  },
}

/* ------------------------------------------------------------------ */
/* Lenient normalization                                               */
/* ------------------------------------------------------------------ */

const looseString = z
  .unknown()
  .transform((v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""))

const severitySchema = z
  .unknown()
  .transform((v): ReportSeverity =>
    typeof v === "string" && (REPORT_SEVERITIES as readonly string[]).includes(v.toLowerCase())
      ? (v.toLowerCase() as ReportSeverity)
      : "info"
  )

const prioritySchema = z
  .unknown()
  .transform((v): ActionPriority =>
    typeof v === "string" && (ACTION_PRIORITIES as readonly string[]).includes(v.toLowerCase())
      ? (v.toLowerCase() as ActionPriority)
      : "medium"
  )

const followUpStatusSchema = z
  .unknown()
  .transform((v): FollowUpStatus =>
    typeof v === "string" && (FOLLOWUP_STATUSES as readonly string[]).includes(v.toLowerCase())
      ? (v.toLowerCase() as FollowUpStatus)
      : "unresolved"
  )

const looseArray = <T extends z.ZodTypeAny>(item: T) =>
  z.unknown().transform((v) => (Array.isArray(v) ? v : [])).pipe(z.array(item))

const reportSchema = z.object({
  headline: looseString,
  overview: looseString,
  followUps: looseArray(
    z.object({
      status: followUpStatusSchema,
      item: looseString,
      note: looseString.optional(),
    })
  ).default([]),
  findings: looseArray(
    z.object({
      severity: severitySchema,
      title: looseString,
      detail: looseString.optional(),
    })
  ).default([]),
  metrics: looseArray(
    z.object({ label: looseString, value: looseString })
  ).default([]),
  causes: looseArray(looseString).default([]),
  actions: looseArray(
    z.object({ priority: prioritySchema, action: looseString })
  ).default([]),
  outlook: looseString.optional(),
})

export type ParseReportResult =
  | { ok: true; report: StructuredReport }
  | { ok: false; error: string }

/** Validate + normalize submit_report arguments. Lenient by design. */
export function parseSubmittedReport(args: Record<string, unknown>): ParseReportResult {
  const parsed = reportSchema.safeParse(args)
  if (!parsed.success) {
    return { ok: false, error: "invalid arguments: could not read report fields" }
  }
  const d = parsed.data
  if (!d.headline || !d.overview) {
    return {
      ok: false,
      error: "missing required fields: 'headline' and 'overview' must both be non-empty strings",
    }
  }
  return {
    ok: true,
    report: {
      headline: d.headline.slice(0, 300),
      overview: d.overview.slice(0, 2000),
      followUps: d.followUps
        .filter((f) => f.item)
        .slice(0, 10)
        .map((f) => ({ status: f.status, item: f.item.slice(0, 300), note: f.note?.slice(0, 500) || null })),
      findings: d.findings
        .filter((f) => f.title)
        .slice(0, 10)
        .map((f) => ({ severity: f.severity, title: f.title.slice(0, 200), detail: f.detail?.slice(0, 500) || null })),
      metrics: d.metrics
        .filter((m) => m.label && m.value)
        .slice(0, 12)
        .map((m) => ({ label: m.label.slice(0, 100), value: m.value.slice(0, 100) })),
      causes: d.causes.filter(Boolean).slice(0, 6).map((c) => c.slice(0, 300)),
      actions: d.actions
        .filter((a) => a.action)
        .slice(0, 6)
        .map((a) => ({ priority: a.priority, action: a.action.slice(0, 300) })),
      outlook: d.outlook?.slice(0, 500) || null,
    },
  }
}

// Markdown rendering lives in report-markdown.ts (zod-free, client-safe).

import { prisma } from "@/lib/prisma"
import { translateTo } from "@/lib/ollama"
import { isBilingualText, hasJapanese, looksEnglish } from "@/lib/bilingual-detect"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { aiLog } from "@/lib/ai-monitor"
import type { StructuredReport } from "@/lib/report-tool"

/**
 * Bilingual (Japanese/Indonesian) post-processing for autonomous AI reports.
 *
 * The agent investigates and writes its report in Japanese (deterministic,
 * best model quality); every text field is then rendered as ID/JA line pairs
 * so mixed-language teams read one report. Per-line language handling:
 *   JA line       → pair = translated-ID + original-JA
 *   ID line       → pair = original-ID + translated-JA
 *   English line  → pair = translated-ID + translated-JA (English never
 *                   survives into the pair — legacy reports were English)
 * isBilingualText() guards each field so re-processing never double-annotates,
 * and pairs whose non-JA side is English are detected and rebuilt.
 *
 * Also converts legacy single-language AiReport rows in place
 * (convertLegacyAiReports). Deleting old reports is NOT done here: the
 * surveillance job's retention sweep (pruneOldReports) owns it, driven by the
 * shared setting in ./ai-report-retention.ts (default 90 days).
 */

/** Max legacy rows converted per surveillance run (each costs LLM calls). */
export const LEGACY_CONVERSION_BATCH = 50

/** True when a bilingual-looking field has English where Indonesian belongs. */
function hasEnglishPairSide(text: string): boolean {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !hasJapanese(l))
    .some(looksEnglish)
}

/** Build ID/JA pairs line by line, choosing translations from the detected language. */
async function buildPairs(text: string, signal?: AbortSignal): Promise<string> {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (out[out.length - 1] !== "") out.push("")
      continue
    }
    if (hasJapanese(line)) {
      out.push(await translateTo(line, "id", signal), line, "")
    } else if (looksEnglish(line)) {
      out.push(await translateTo(line, "id", signal), await translateTo(line, "ja", signal), "")
    } else {
      // Assume Indonesian — keep the original as the ID side.
      out.push(line, await translateTo(line, "ja", signal), "")
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop()
  return out.join("\n")
}

/**
 * Bilingualize one field. Untouched when empty or already correct ID/JA
 * pairs; rebuilt from its Japanese lines when the pairs carry English.
 */
async function toBilingual(text: string | null | undefined, signal?: AbortSignal): Promise<string> {
  const original = text ?? ""
  if (!original.trim()) return original
  try {
    if (isBilingualText(original)) {
      if (!hasEnglishPairSide(original)) return original
      // Repair: drop the English side, regenerate ID from the JA lines.
      const jaOnly = original
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && hasJapanese(l))
        .join("\n")
      if (!jaOnly) return original
      const repaired = await buildPairs(jaOnly, signal)
      return repaired.trim() || original
    }
    const built = await buildPairs(original.trim(), signal)
    return built.trim() || original
  } catch {
    // Translation failure must never lose report content.
    return original
  }
}

/** Bilingualize every prose field of a structured report (metric values are numbers — skipped). */
export async function bilingualizeStructuredReport(
  report: StructuredReport,
  signal?: AbortSignal
): Promise<StructuredReport> {
  const followUps: StructuredReport["followUps"] = []
  for (const f of report.followUps ?? []) {
    followUps.push({
      status: f.status,
      item: await toBilingual(f.item, signal),
      note: f.note ? await toBilingual(f.note, signal) : null,
    })
  }
  const findings: StructuredReport["findings"] = []
  for (const f of report.findings) {
    findings.push({
      severity: f.severity,
      title: await toBilingual(f.title, signal),
      detail: f.detail ? await toBilingual(f.detail, signal) : null,
    })
  }
  const metrics: StructuredReport["metrics"] = []
  for (const m of report.metrics) {
    metrics.push({ label: await toBilingual(m.label, signal), value: m.value })
  }
  const causes: string[] = []
  for (const c of report.causes) causes.push(await toBilingual(c, signal))
  const actions: StructuredReport["actions"] = []
  for (const a of report.actions) {
    actions.push({ priority: a.priority, action: await toBilingual(a.action, signal) })
  }
  return {
    headline: await toBilingual(report.headline, signal),
    overview: await toBilingual(report.overview, signal),
    followUps,
    findings,
    metrics,
    causes,
    actions,
    outlook: report.outlook ? await toBilingual(report.outlook, signal) : null,
  }
}

/** Bilingualize a plain-text/markdown report body (fallback path, line-pair rendering). */
export async function bilingualizeReportBody(body: string, signal?: AbortSignal): Promise<string> {
  return toBilingual(body, signal)
}

export interface ConvertLegacyOptions {
  signal?: AbortSignal
  /** Rows examined per call (newest first). Default LEGACY_CONVERSION_BATCH. */
  limit?: number
  /** Awaited once, right before the first LLM conversion (yield to busy web users). */
  beforeConvert?: (signal?: AbortSignal) => Promise<void>
}

/** A row needs conversion when its main prose is not clean JA/ID pairs. */
function needsConversion(r: { structured: string | null; body: string | null }): boolean {
  const rowOk = (s: string) => isBilingualText(s) && !hasEnglishPairSide(s)
  if (r.structured) {
    try {
      const parsed = JSON.parse(r.structured) as StructuredReport
      // Overview/headline are the report's main prose — a reliable probe for the whole row.
      return !(rowOk(parsed.overview) && rowOk(parsed.headline))
    } catch {
      return false
    }
  }
  return Boolean(r.body) && !rowOk(r.body ?? "")
}

async function convertOne(r: { id: string; structured: string | null; body: string | null }, signal?: AbortSignal): Promise<void> {
  if (r.structured) {
    const bi = await bilingualizeStructuredReport(JSON.parse(r.structured) as StructuredReport, signal)
    await prisma.aiReport.update({
      where: { id: r.id },
      data: {
        structured: JSON.stringify(bi),
        body: structuredReportToMarkdown(bi, "ja"),
        summary: bi.headline.slice(0, 500),
      },
    })
    return
  }
  const body = await bilingualizeReportBody(r.body ?? "", signal)
  await prisma.aiReport.update({ where: { id: r.id }, data: { body } })
}

/**
 * Convert legacy single-language (or English-paired) reports to JA/ID
 * bilingual in place. Idempotent: already-bilingual rows are skipped. Never
 * deletes anything. Per-row failures are logged and skipped; stops early
 * when `signal` aborts.
 */
export async function convertLegacyAiReports(opts: ConvertLegacyOptions = {}): Promise<{ converted: number }> {
  const reports = await prisma.aiReport.findMany({
    select: { id: true, structured: true, body: true },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? LEGACY_CONVERSION_BATCH,
  })
  const pending = reports.filter(needsConversion)
  if (pending.length === 0) return { converted: 0 }
  await opts.beforeConvert?.(opts.signal)

  let converted = 0
  for (const r of pending) {
    if (opts.signal?.aborted) break
    try {
      await convertOne(r, opts.signal)
      converted++
    } catch (err) {
      aiLog("CHAT_ERROR", `report conversion ${r.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (converted > 0) {
    aiLog("SURVEIL", `report conversion: ${converted} legacy report(s) converted to JA/ID bilingual`)
  }
  return { converted }
}

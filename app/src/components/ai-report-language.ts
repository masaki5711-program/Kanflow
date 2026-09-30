/**
 * Pure: show an AI report in the viewer's UI language where the report allows it.
 *
 * - Autonomous reports (surveillance / sprint completion) are stored as JA/ID
 *   line pairs per field → a ja viewer sees the Japanese lines, an id viewer
 *   the Indonesian ones (en viewers keep both: there is no English side).
 * - A progress report is written in its requester's language → it is shown
 *   as is, with `sourceLang` so the UI can say which language it is in.
 */
import { hasJapanese, isBilingualText, looksEnglish } from "@/lib/bilingual-detect"
import type { Language } from "@/lib/i18n"
import type { StructuredReport } from "@/lib/report-tool"

export type ReportLang = Language | "bilingual"

/** Progress report titles per generation language (lib/progress-report PROGRESS_REPORT_TITLE). */
const PROGRESS_TITLES: Readonly<Record<Language, string>> = {
  ja: "📊 進捗レポート",
  en: "📊 Progress report",
  id: "📊 Laporan progres",
}

/** Keep the viewer's side of a JA/ID paired text; anything else is returned unchanged. */
export function pickBilingualLines(text: string, language: Language): string {
  if (language === "en" || !isBilingualText(text)) return text
  const keepJapanese = language === "ja"
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim() || hasJapanese(line) === keepJapanese)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** "JA title / ID title: suffix" → the viewer's side (+ suffix); other titles unchanged. */
export function pickReportTitle(title: string, language: Language): string {
  const known = Object.entries(PROGRESS_TITLES).find(([, value]) => value === title)
  if (known) return PROGRESS_TITLES[language]
  const match = /^(.*?) \/ ([^:]*)(:.*)?$/.exec(title)
  if (!match || language === "en") return title
  const [, left, right, suffix = ""] = match
  if (hasJapanese(left) === hasJapanese(right)) return title
  const ja = hasJapanese(left) ? left : right
  const id = hasJapanese(left) ? right : left
  return `${language === "ja" ? ja : id}${suffix}`
}

/** Language a report was written in ("bilingual" for JA/ID pairs). */
export function detectReportLang(sample: string): ReportLang {
  if (isBilingualText(sample)) return "bilingual"
  if (hasJapanese(sample)) return "ja"
  return looksEnglish(sample) ? "en" : "id"
}

function pickOrNull(text: string | null, language: Language): string | null {
  return text === null ? null : pickBilingualLines(text, language)
}

/** Every text field of a structured report reduced to the viewer's language. */
export function localizeStructuredReport(report: StructuredReport, language: Language): StructuredReport {
  const pick = (text: string) => pickBilingualLines(text, language)
  return {
    ...report,
    headline: pick(report.headline),
    overview: pick(report.overview),
    followUps: report.followUps.map((f) => ({ ...f, item: pick(f.item), note: pickOrNull(f.note, language) })),
    findings: report.findings.map((f) => ({ ...f, title: pick(f.title), detail: pickOrNull(f.detail, language) })),
    metrics: report.metrics.map((m) => ({ label: pick(m.label), value: pick(m.value) })),
    causes: report.causes.map(pick),
    actions: report.actions.map((a) => ({ ...a, action: pick(a.action) })),
    outlook: pickOrNull(report.outlook, language),
  }
}

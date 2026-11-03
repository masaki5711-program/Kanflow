"use client"

import { useCallback } from "react"
import { DATE_LOCALE } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { ruleSummary } from "@/lib/plan-lesson-rules/describe"

/** The rule sentence in the UI language, numbers written for its locale — the same text on card, editor and dialogs. */
export function useRuleSummary(): (kind: string, params: unknown) => string {
  const { t, language } = useLanguage()
  return useCallback((kind, params) => ruleSummary(kind, params, t, DATE_LOCALE[language]), [t, language])
}

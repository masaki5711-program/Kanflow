"use client"

import { FileSpreadsheet } from "lucide-react"
import { buttonClasses, type ButtonSize } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

interface Props {
  /** Export endpoint, e.g. `/api/projects/<id>/backlog/export`. */
  href: string
  /** Extra query parameters (e.g. `{ sprintId }`); empty values are dropped. */
  params?: Record<string, string | undefined>
  size?: ButtonSize
  className?: string
  /** Tooltip (default: the generic export hint). */
  title?: string
  /** Hide the label visually below `sm` (it stays the accessible name); for crowded phone toolbars. */
  iconOnlyOnPhone?: boolean
}

/** Pure: export URL with the UI language (sheet / header names) and extra params. */
export function exportHref(href: string, language: string, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams({ lang: language })
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  return `${href}?${q.toString()}`
}

/**
 * "Excel 出力": a plain download link — the browser streams the .xlsx with
 * the server's file name (Content-Disposition), no client-side buffering.
 */
export function ExcelExportButton({ href, params, size = "md", className, title, iconOnlyOnPhone = false }: Props) {
  const { t, language } = useLanguage()
  return (
    <a href={exportHref(href, language, params)} download title={title ?? t.excelExportHint} className={buttonClasses({ variant: "secondary", size, className })}>
      <FileSpreadsheet aria-hidden className="h-4 w-4" />
      {iconOnlyOnPhone ? <span className="sr-only sm:not-sr-only">{t.excelExport}</span> : t.excelExport}
    </a>
  )
}

"use client"

import { BookOpen } from "lucide-react"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"

/** Response → repository names; anything malformed reads as "none" (the hint simply stays hidden). */
export function toKnowledgeNames(raw: unknown): string[] {
  const list = raw && typeof raw === "object" ? (raw as { repositories?: unknown }).repositories : null
  if (!Array.isArray(list)) return []
  return list.map((r) => (r as { name?: unknown } | null)?.name).filter((n): n is string => typeof n === "string" && n.length > 0)
}

/**
 * Small chip "仕様書リポジトリを参照できます" when the project has GitLab
 * repositories switched on as AI reference material (names in the tooltip).
 */
export function KnowledgeHint({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const query = useApiQuery<string[]>(`/api/projects/${projectId}/git/knowledge`, { parse: toKnowledgeNames, toastOnError: false })
  const names = query.data ?? []
  if (names.length === 0) return null
  return (
    <span
      title={fillTemplate(t.chatKbHintTitle, { names: names.join(", ") })}
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-caption text-primary"
    >
      <BookOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t.chatKbHint}</span>
      <span className="sr-only">: {names.join(", ")}</span>
    </span>
  )
}

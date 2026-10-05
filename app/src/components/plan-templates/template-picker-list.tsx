"use client"

import { Search } from "lucide-react"
import { Badge, Input, cn } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { groupTemplates, type PlanTemplateSummaryDto } from "./template-groups"

interface Props {
  templates: readonly PlanTemplateSummaryDto[]
  query: string
  onQuery: (q: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Searchable template list in 共通 / 自分 / みんな sections; one template is selected (aria-pressed). */
export function TemplatePickerList({ templates, query, onQuery, selectedId, onSelect }: Props) {
  const { t } = useLanguage()
  const groups = groupTemplates(templates, query)
  const sections = [
    { key: "builtin", title: t.tplSectionBuiltin, list: groups.builtin },
    { key: "mine", title: t.tplSectionMine, list: groups.mine },
    { key: "shared", title: t.tplSectionShared, list: groups.shared },
  ].filter((s) => s.list.length > 0)

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t.tplSearch} aria-label={t.tplSearch} className="pl-8" />
      </div>
      {sections.length === 0 && <p className="px-1 text-body text-fg-muted">{templates.length === 0 ? t.tplNoTemplates : t.tplNoMatches}</p>}
      {sections.map((s) => (
        <section key={s.key} aria-labelledby={`tpl-sec-${s.key}`}>
          <h3 id={`tpl-sec-${s.key}`} className="mb-1 px-1 text-caption font-semibold uppercase tracking-wide text-fg-muted">
            {s.title}
          </h3>
          <ul className="space-y-0.5">
            {s.list.map((tpl) => (
              <li key={tpl.id}>
                <button
                  type="button"
                  aria-pressed={tpl.id === selectedId}
                  data-template-id={tpl.id}
                  onClick={() => onSelect(tpl.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-ui-sm px-2 py-1.5 text-left text-body",
                    tpl.id === selectedId ? "bg-primary-soft font-medium text-primary-strong ring-1 ring-primary/30" : "text-fg hover:bg-surface-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
                  {tpl.visibility === "private" && <Badge>{t.tplPrivateBadge}</Badge>}
                  <span className="shrink-0 text-caption text-fg-muted tabular-nums">{fillTemplate(t.tplStageCount, { n: tpl.stageCount })}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

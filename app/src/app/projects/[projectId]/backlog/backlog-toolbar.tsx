"use client"

import { useState, type ReactNode } from "react"
import { Button, Input, Select } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { FILTER_NONE, hasActiveFilters, type BacklogFilters, type FacetOptions } from "./url-state"
import { CheckSquare, FilterX, Search } from "lucide-react"

interface Props {
  filters: BacklogFilters
  facets: FacetOptions
  onChange: (patch: Partial<BacklogFilters>) => void
  shown: number
  total: number
  /** Selection-mode toggle (omitted when the viewer has no bulk rights). */
  selectMode?: { active: boolean; onToggle: () => void }
}

/**
 * Text search that stays in sync with `?q=`: typing writes the URL, and a URL
 * change from elsewhere (Back / a link) replaces the text.
 */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (q: string) => void; placeholder: string }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (value !== draft) setDraft(value)
  }
  return (
    <div className="relative min-w-60 flex-1">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
        <Search className="h-4 w-4 text-fg-subtle" />
      </div>
      <Input
        type="search"
        inputSize="lg"
        aria-label={t.backlogSearchLabel}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        className="pl-10 shadow-ui-sm"
      />
    </div>
  )
}

function Facet({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <Select selectSize="sm" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="w-auto max-w-48">
      <option value="">
        {label}: {t.backlogFilterAll}
      </option>
      {children}
    </Select>
  )
}

export function BacklogToolbar({ filters, facets, onChange, shown, total, selectMode }: Props) {
  const { t, pt, language } = useLanguage()
  const active = hasActiveFilters(filters)
  const none = <option value={FILTER_NONE}>{t.backlogFilterNone}</option>

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={filters.q} onChange={(q) => onChange({ q })} placeholder={`${pt.backlogInitiative} / ${pt.backlogEpic} / ${pt.backlogUserStory}`} />
        {selectMode && (
          <Button
            variant={selectMode.active ? "primary" : "secondary"}
            aria-pressed={selectMode.active}
            onClick={selectMode.onToggle}
            leftIcon={<CheckSquare className="h-4 w-4" />}
          >
            {selectMode.active ? t.backlogSelectModeExit : t.backlogSelectMode}
          </Button>
        )}
      </div>
      <div role="group" aria-label={t.backlogFiltersLabel} className="flex flex-wrap items-center gap-2">
        <Facet label={t.backlogFilterStatus} value={filters.status} onChange={(v) => onChange({ status: v as BacklogFilters["status"] })}>
          <option value="ready">{t.backlogStatusReady}</option>
          <option value="not_ready">{t.backlogStatusNotReady}</option>
          <option value="completed">{t.backlogStatusCompleted}</option>
        </Facet>
        <Facet label={t.backlogFilterGoal} value={filters.goal} onChange={(goal) => onChange({ goal })}>
          {facets.hasMissing.goal && none}
          {facets.goals.map((g) => (
            <option key={g.id} value={g.id}>
              {pickText(g.i18n, "title", g.title, language).text}
            </option>
          ))}
        </Facet>
        <Facet label={pt.backlogEpic} value={filters.epic} onChange={(epic) => onChange({ epic })}>
          {facets.hasMissing.epic && none}
          {facets.epics.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Facet>
        <Facet label={pt.backlogWorkloadScore} value={filters.points} onChange={(points) => onChange({ points })}>
          {facets.points.map((p) => (
            <option key={p} value={String(p)}>
              {p}
            </option>
          ))}
        </Facet>
        <Facet label={pt.rolePO} value={filters.po} onChange={(po) => onChange({ po })}>
          {facets.hasMissing.po && none}
          {facets.pos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Facet>
        {active && (
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<FilterX className="h-4 w-4" />}
              onClick={() => onChange({ q: "", status: "", goal: "", epic: "", points: "", po: "" })}
            >
              {t.backlogFilterClear}
            </Button>
            <span className="text-caption text-fg-muted" role="status">
              {t.backlogFilterResult.replace("{shown}", String(shown)).replace("{total}", String(total))}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

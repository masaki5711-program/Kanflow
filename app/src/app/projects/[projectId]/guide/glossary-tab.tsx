"use client"

import { useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { EmptyState, Field, Input } from "@/components/ui"
import { GLOSSARY_ENTRIES, CATEGORY_LABELS, CATEGORY_COLORS, type GlossaryCategory } from "./glossary-data"
import { CategoryFilter } from "./category-filter"
import { ExternalLink, Search } from "lucide-react"

/** Entries with a stable id (position in the static data array). */
const ENTRIES = GLOSSARY_ENTRIES.map((entry, i) => ({ ...entry, id: `glossary-${i}` }))
const CATEGORIES = Object.keys(CATEGORY_LABELS) as GlossaryCategory[]

export function GlossaryTab() {
  const { t, projectType, language } = useLanguage()
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState<GlossaryCategory | "all">("all")

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return ENTRIES.filter((entry) => {
      const matchesType = !entry.projectTypes || entry.projectTypes.includes(projectType)
      const matchesSearch =
        !q ||
        entry.term[language].toLowerCase().includes(q) ||
        entry.english.toLowerCase().includes(q) ||
        entry.description[language].toLowerCase().includes(q)
      const matchesCategory = filterCategory === "all" || entry.category === filterCategory
      return matchesType && matchesSearch && matchesCategory
    })
  }, [search, filterCategory, projectType, language])

  const countLabel =
    filtered.length === 1 ? t.guideResultsCountOne : t.guideResultsCount.replace("{count}", String(filtered.length))

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Field label={t.guideSearchLabel} hideLabel className="flex-1">
          <div className="relative">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.guideSearchPlaceholder}
              className="pl-9"
            />
          </div>
        </Field>
        <CategoryFilter
          categories={CATEGORIES}
          labels={CATEGORY_LABELS}
          value={filterCategory}
          onChange={setFilterCategory}
        />
      </div>

      <p className="text-caption text-fg-muted mb-3" role="status" aria-live="polite">
        {countLabel}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title={t.guideNoResults}
          description={t.guideNoResultsHint}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-sm font-bold text-fg">{entry.term[language]}</h3>
                  <p className="text-caption text-fg-muted" lang="en">
                    {entry.english}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-caption font-semibold ${CATEGORY_COLORS[entry.category]}`}
                >
                  {CATEGORY_LABELS[entry.category][language]}
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{entry.description[language]}</p>
              {entry.kanflow && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-caption text-blue-700">
                  <ExternalLink className="w-3 h-3" />
                  <span>{entry.kanflow[language]}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

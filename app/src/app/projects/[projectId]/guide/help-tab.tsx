"use client"

import { useMemo, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { DisclosureChevron, EmptyState, cn } from "@/components/ui"
import { FAQ_ENTRIES, FAQ_CATEGORY_LABELS, FAQ_CATEGORY_COLORS, type FaqCategory } from "./faq-data"
import { CategoryFilter } from "./category-filter"

/** FAQ items with a stable id (position in the static data array). */
const ITEMS = FAQ_ENTRIES.map((item, i) => ({ ...item, id: `faq-${i}` }))
const CATEGORIES = Object.keys(FAQ_CATEGORY_LABELS) as FaqCategory[]

export function HelpTab() {
  const { t, projectType, language } = useLanguage()
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})
  const [filterCategory, setFilterCategory] = useState<FaqCategory | "all">("all")

  const filtered = useMemo(
    () =>
      ITEMS.filter((item) => {
        const matchesType = !item.projectTypes || item.projectTypes.includes(projectType)
        const matchesCategory = filterCategory === "all" || item.category === filterCategory
        return matchesType && matchesCategory
      }),
    [filterCategory, projectType],
  )

  const toggle = (id: string) => {
    setOpenItems((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div>
      <CategoryFilter
        categories={CATEGORIES}
        labels={FAQ_CATEGORY_LABELS}
        value={filterCategory}
        onChange={setFilterCategory}
        className="mb-6"
      />

      {filtered.length === 0 && <EmptyState title={t.guideNoFaq} compact />}

      <div className="space-y-2">
        {filtered.map((item) => {
          const isOpen = !!openItems[item.id]
          const panelId = `${item.id}-panel`
          const headerId = `${item.id}-header`
          return (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <h3>
                <button
                  type="button"
                  id={headerId}
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-caption font-semibold ${FAQ_CATEGORY_COLORS[item.category]}`}
                  >
                    {FAQ_CATEGORY_LABELS[item.category][language]}
                  </span>
                  <span className="flex-1 text-sm font-medium text-fg">{item.question[language]}</span>
                  <DisclosureChevron open={isOpen} variant="down" className="h-5 w-5 text-fg-muted" />
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                aria-hidden={!isOpen}
                inert={!isOpen}
                className={cn(
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
                )}
              >
                <div className="px-4 pb-4 pt-0 ml-[72px]">
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {item.answer[language]}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

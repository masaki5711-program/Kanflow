"use client"

import type { Language } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"

interface CategoryFilterProps<C extends string> {
  categories: readonly C[]
  labels: Record<C, Record<Language, string>>
  value: C | "all"
  onChange: (value: C | "all") => void
  className?: string
}

function pillClass(active: boolean): string {
  return cn(
    "px-3 py-1.5 min-h-8 rounded-full text-caption font-medium transition-colors",
    active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
  )
}

/** Toggle-pill category filter ("All" + one pill per category). */
export function CategoryFilter<C extends string>({
  categories,
  labels,
  value,
  onChange,
  className,
}: CategoryFilterProps<C>) {
  const { t, language } = useLanguage()
  return (
    <div role="group" aria-label={t.guideCategoryFilterLabel} className={cn("flex gap-1.5 flex-wrap", className)}>
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={pillClass(value === "all")}
      >
        {t.guideFilterAll}
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          aria-pressed={value === cat}
          onClick={() => onChange(cat)}
          className={pillClass(value === cat)}
        >
          {labels[cat][language]}
        </button>
      ))}
    </div>
  )
}

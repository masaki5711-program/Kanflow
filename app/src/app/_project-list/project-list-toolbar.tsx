"use client"

import type { ReactNode } from "react"
import { LayoutList, Rows3, Search } from "lucide-react"
import { cn, Input, Select } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { ProjectTypeMark } from "./project-parts"
import { projectTypeLabel, type Density, type SortBy, type TypeFilter, type ViewMode } from "./types"

const TYPE_FILTERS: readonly TypeFilter[] = ["all", "software", "process_improvement", "general"]

interface Props {
  searchQuery: string
  onSearchChange: (q: string) => void
  typeFilter: TypeFilter
  onTypeFilterChange: (f: TypeFilter) => void
  sortBy: SortBy
  onSortChange: (s: SortBy) => void
  density: Density
  onDensityChange: (d: Density) => void
  /** Shown only when the user has categories. */
  viewMode: ViewMode | null
  onViewModeChange: (v: ViewMode) => void
}

function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg bg-surface-sunken p-0.5 text-caption">
      {children}
    </div>
  )
}

function SegmentButton({
  pressed,
  onClick,
  label,
  children,
}: {
  pressed: boolean
  onClick: () => void
  label?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "min-h-8 min-w-8 rounded-md px-2.5 py-1 font-medium transition-colors",
        pressed ? "bg-surface text-fg shadow-ui-sm" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  )
}

export function ProjectListToolbar(props: Props) {
  const { t, language } = useLanguage()
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-ui-sm">
      <div className="relative min-w-[200px] flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          type="search"
          inputSize="sm"
          value={props.searchQuery}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder={t.projectSearchPlaceholder}
          aria-label={t.projectSearchPlaceholder}
          className="pl-9"
        />
      </div>

      <Segmented label={t.projectTypeFilterLabel}>
        {TYPE_FILTERS.map((type) => (
          <SegmentButton
            key={type}
            pressed={props.typeFilter === type}
            onClick={() => props.onTypeFilterChange(type)}
            label={type === "all" ? undefined : projectTypeLabel(type, language)}
          >
            {type === "all" ? t.userFilterRoleAll : <ProjectTypeMark type={type} />}
          </SegmentButton>
        ))}
      </Segmented>

      <Select
        selectSize="sm"
        value={props.sortBy}
        onChange={(e) => props.onSortChange(e.target.value as SortBy)}
        aria-label={t.projectSortLabel}
        className="w-auto"
      >
        <option value="updated">{t.projectSortUpdated}</option>
        <option value="favorite">{t.projectSortFavorite}</option>
        <option value="name">{t.projectSortNameAsc}</option>
        <option value="name_asc">{t.projectSortNameDesc}</option>
        <option value="progress">{t.projectSortProgress}</option>
      </Select>

      <Segmented label={t.projectDensityLabel}>
        <SegmentButton
          pressed={props.density === "comfortable"}
          onClick={() => props.onDensityChange("comfortable")}
          label={t.projectDensityComfortable}
        >
          <Rows3 aria-hidden="true" className="h-4 w-4" />
        </SegmentButton>
        <SegmentButton
          pressed={props.density === "compact"}
          onClick={() => props.onDensityChange("compact")}
          label={t.projectDensityCompact}
        >
          <LayoutList aria-hidden="true" className="h-4 w-4" />
        </SegmentButton>
      </Segmented>

      {props.viewMode && (
        <Segmented label={t.projectViewModeLabel}>
          <SegmentButton pressed={props.viewMode === "flat"} onClick={() => props.onViewModeChange("flat")}>
            {t.categoryFlat}
          </SegmentButton>
          <SegmentButton pressed={props.viewMode === "category"} onClick={() => props.onViewModeChange("category")}>
            {t.categoryCategory}
          </SegmentButton>
        </Segmented>
      )}
    </div>
  )
}

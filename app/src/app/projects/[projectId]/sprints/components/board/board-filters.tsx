"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Input, Select, cn } from "@/components/ui"
import { isFilterActive, SWIMLANE_MODES, type SwimlaneMode } from "./board-model"
import { MAX_QUERY_LENGTH, type SprintView } from "./board-url-state"
import type { BoardViewState } from "../../hooks/use-board-view-state"
import type { Member } from "../types"
import type { ListPrefs } from "../../hooks/use-list-prefs"
import { Columns3, List, Search, User, X } from "lucide-react"

/** Typing pause before the text filter is written to the URL. */
export const QUERY_DEBOUNCE_MS = 250

interface Props {
  state: BoardViewState
  members: readonly Member[]
  shownCount: number
  totalCount: number
  /** The viewer's open tasks in this sprint (null = not signed in: no "my tasks" chip). */
  myOpenCount?: number | null
  /** List-view display options (grouping, density); absent on the board. */
  listPrefs?: ListPrefs & { setGroupBy: (g: ListPrefs["groupBy"]) => void; setDensity: (d: ListPrefs["density"]) => void }
}

/** Two-way segmented control with the same look as the list / board toggle. */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-ui-sm border border-border-strong bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex min-h-8 items-center rounded-[6px] px-2.5 text-caption font-medium",
            value === o.value ? "bg-primary text-primary-fg shadow-ui-sm" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ViewToggle({ view, onChange }: { view: SprintView; onChange: (v: SprintView) => void }) {
  const { t } = useLanguage()
  const options: { value: SprintView; label: string; icon: ReactNode }[] = [
    { value: "list", label: t.sprintBoardViewList, icon: <List className="h-4 w-4" aria-hidden="true" /> },
    { value: "board", label: t.sprintBoardViewBoard, icon: <Columns3 className="h-4 w-4" aria-hidden="true" /> },
  ]
  return (
    <div role="group" aria-label={t.sprintBoardViewLabel} className="inline-flex rounded-ui-sm border border-border-strong bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={view === o.value} onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-[6px] px-3 text-body font-medium",
            view === o.value ? "bg-primary text-primary-fg shadow-ui-sm" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
          )}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Text filter with local state; the URL is updated after a short typing pause. */
function QueryInput({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const { t } = useLanguage()
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  const [lastSent, setLastSent] = useState(value)
  // Adopt outside changes (back button, "clear filters") without clobbering typing.
  if (value !== synced) {
    setSynced(value)
    if (value !== lastSent) setDraft(value)
  }

  useEffect(() => {
    if (draft.trim() === value.trim()) return
    const timer = window.setTimeout(() => {
      setLastSent(draft.trim())
      onCommit(draft)
    }, QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, value, onCommit])

  return (
    <div className="relative min-w-0 flex-1 basis-48 sm:max-w-xs">
      <label htmlFor={id} className="sr-only">{t.sprintBoardFilterText}</label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <Input id={id} type="search" inputSize="sm" value={draft} maxLength={MAX_QUERY_LENGTH}
        placeholder={t.sprintBoardFilterTextPlaceholder} className="pl-8"
        onChange={(e) => setDraft(e.target.value)} />
    </div>
  )
}

/** View toggle, swimlanes (board only), assignee and text filters of a sprint. */
export default function BoardFilters({ state, members, shownCount, totalCount, myOpenCount = null, listPrefs }: Props) {
  const { t } = useLanguage()
  const swimId = useId()
  const assigneeId = useId()
  const swimLabels: Record<SwimlaneMode, string> = {
    none: t.sprintBoardSwimlaneNone, assignee: t.sprintBoardSwimlaneAssignee, pbi: t.sprintBoardSwimlanePbi,
  }
  const active = isFilterActive(state.filter)
  const labelClass = "inline-flex items-center gap-1.5 text-caption font-medium text-fg-muted"

  return (
    <div role="group" aria-label={t.sprintBoardToolbar} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ViewToggle view={state.view} onChange={state.setView} />
      {myOpenCount !== null && (
        <button type="button" aria-pressed={state.filter.assignee === "me"}
          onClick={() => state.setAssignee(state.filter.assignee === "me" ? "" : "me")}
          title={myOpenCount === 0 ? t.sprintUxMyOpenNone : undefined}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-body font-medium transition-colors",
            state.filter.assignee === "me"
              ? "border-primary bg-primary-soft text-primary-active"
              : "border-border-strong bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg",
          )}>
          <User className="h-4 w-4" aria-hidden="true" />
          {t.sprintUxMyOpen.replace("{n}", String(myOpenCount))}
        </button>
      )}
      {listPrefs && (
        <>
          <Segmented label={t.sprintUxGroupBy} value={listPrefs.groupBy} onChange={listPrefs.setGroupBy}
            options={[{ value: "pbi", label: t.sprintUxGroupPbi }, { value: "assignee", label: t.sprintUxGroupAssignee }]} />
          <Segmented label={t.sprintUxDensity} value={listPrefs.density} onChange={listPrefs.setDensity}
            options={[{ value: "normal", label: t.sprintUxDensityNormal }, { value: "compact", label: t.sprintUxDensityCompact }]} />
        </>
      )}
      {state.view === "board" && (
        <span className={labelClass}>
          <label htmlFor={swimId}>{t.sprintBoardSwimlane}</label>
          <Select id={swimId} selectSize="sm" value={state.swimlane}
            onChange={(e) => state.setSwimlane(e.target.value as SwimlaneMode)}>
            {SWIMLANE_MODES.map((m) => <option key={m} value={m}>{swimLabels[m]}</option>)}
          </Select>
        </span>
      )}
      <span className={labelClass}>
        <label htmlFor={assigneeId}>{t.sprintBoardFilterAssignee}</label>
        <Select id={assigneeId} selectSize="sm" value={state.filter.assignee} onChange={(e) => state.setAssignee(e.target.value)}>
          <option value="">{t.sprintBoardFilterAll}</option>
          <option value="me">{t.sprintBoardFilterMe}</option>
          <option value="unassigned">{t.sprintBoardFilterUnassigned}</option>
          {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
        </Select>
      </span>
      <QueryInput value={state.filter.query} onCommit={state.setQuery} />
      {active && (
        <span className="inline-flex items-center gap-2">
          <span className="text-caption text-fg-muted">
            {t.sprintBoardFilterCount.replace("{shown}", String(shownCount)).replace("{total}", String(totalCount))}
          </span>
          <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={state.clearFilters}>
            {t.sprintBoardFilterClear}
          </Button>
        </span>
      )}
    </div>
  )
}

"use client"

import { CalendarClock, CircleDot, Copy, ListChecks, User, X } from "lucide-react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "../lib/template"
import type { BulkMode } from "./plan-bulk-dialog"

interface Props {
  count: number
  onBulk: (mode: BulkMode) => void
  onDuplicate: () => void
  onSelectVisible: () => void
  onClear: () => void
  onDone: () => void
}

/** The action bar of multi-select mode (above the chart). */
export function PlanBulkBar({ count, onBulk, onDuplicate, onSelectVisible, onClear, onDone }: Props) {
  const { t } = useLanguage()
  const none = count === 0
  return (
    <div
      role="toolbar"
      aria-label={t.pscBulkTitle}
      data-plan-print-hide=""
      className="flex flex-wrap items-center gap-2 rounded-ui-lg border border-primary/40 bg-primary-soft px-3 py-2"
    >
      <span aria-live="polite" className="mr-1 text-body font-semibold text-primary-strong">
        {fillTemplate(t.pscSelectedCount, { n: count })}
      </span>
      <Button size="sm" variant="secondary" leftIcon={<CalendarClock className="h-4 w-4" />} disabled={none} onClick={() => onBulk("shift")}>
        {t.pscBulkShift}
      </Button>
      <Button size="sm" variant="secondary" leftIcon={<User className="h-4 w-4" />} disabled={none} onClick={() => onBulk("owner")}>
        {t.pscBulkOwner}
      </Button>
      <Button size="sm" variant="secondary" leftIcon={<CircleDot className="h-4 w-4" />} disabled={none} onClick={() => onBulk("status")}>
        {t.pscBulkStatus}
      </Button>
      <Button size="sm" variant="secondary" leftIcon={<Copy className="h-4 w-4" />} disabled={none} onClick={onDuplicate}>
        {t.pscDuplicate}
      </Button>
      <span className="mx-1 hidden h-5 w-px bg-border-strong sm:inline-block" aria-hidden="true" />
      <Button size="sm" variant="ghost" leftIcon={<ListChecks className="h-4 w-4" />} onClick={onSelectVisible}>
        {t.pscSelectVisible}
      </Button>
      <Button size="sm" variant="ghost" disabled={none} onClick={onClear}>
        {t.pscClearSelection}
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<X className="h-4 w-4" />} onClick={onDone}>
        {t.pscSelectModeOff}
      </Button>
    </div>
  )
}

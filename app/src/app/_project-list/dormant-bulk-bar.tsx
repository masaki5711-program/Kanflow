"use client"

import { Archive, Moon } from "lucide-react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

interface Props {
  /** Dormant projects currently shown (dormant-only filter on). */
  count: number
  onBulkArchive: () => void
}

/** Shown while the "dormant only" filter is on: offers archiving all shown dormant projects at once. */
export function DormantBulkBar({ count, onBulkArchive }: Props) {
  const { t } = useLanguage()
  if (count === 0) return null
  return (
    <div
      data-testid="dormant-bulk-bar"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-2.5"
    >
      <p className="inline-flex items-center gap-1.5 text-body font-medium text-warning-strong">
        <Moon aria-hidden="true" className="h-4 w-4" />
        {t.projectFilterDormantOnly} ({count})
      </p>
      <Button size="sm" variant="secondary" leftIcon={<Archive aria-hidden="true" className="h-4 w-4" />} onClick={onBulkArchive}>
        {t.projectBulkArchiveButton}
      </Button>
    </div>
  )
}

"use client"

import { Moon, X } from "lucide-react"
import { Button, IconButton } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { DORMANT_DAYS } from "./dormancy"

interface Props {
  /** Dormant projects the viewer may archive (the banner is not rendered for 0). */
  count: number
  onReview: () => void
  onDismiss: () => void
}

function fill(template: string, values: Record<string, number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

/** Monthly reminder above the project list: "N dormant projects — review / hide for 30 days". */
export function DormantBanner({ count, onReview, onDismiss }: Props) {
  const { t } = useLanguage()
  if (count <= 0) return null
  const title = fill(t.projectDormantBannerTitle, { count })
  return (
    <section
      data-testid="dormant-banner"
      aria-label={title}
      className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center"
    >
      <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-warning-strong sm:inline-flex">
        <Moon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-warning-strong">{title}</p>
        <p className="mt-0.5 text-caption text-warning-strong">{fill(t.projectDormantBannerBody, { days: DORMANT_DAYS })}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onReview}>
          {t.projectDormantBannerAction}
        </Button>
        <IconButton label={t.projectDormantBannerDismiss} title={t.projectDormantBannerDismiss} size="sm" icon={<X className="h-4 w-4" />} onClick={onDismiss} />
      </div>
    </section>
  )
}

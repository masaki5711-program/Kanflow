"use client"

import Link from "next/link"
import { CalendarClock, Diamond, Flag, ListTree } from "lucide-react"
import { EmptyState, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import type { DueItem, DueKind } from "./dashboard-summary"
import { formatLongDate } from "@/lib/format-date"

const KIND_ICON: Record<DueKind, typeof Flag> = { sprint_end: Flag, milestone: Diamond, plan_item: ListTree }

function kindLabel(kind: DueKind, t: Translations): string {
  if (kind === "sprint_end") return t.dashboardDueSprintEnd
  return kind === "milestone" ? t.dashboardDueMilestone : t.dashboardDuePlanItem
}

function whenLabel(days: number, t: Translations): string {
  if (days < 0) return t.dashboardDueOverdue
  if (days === 0) return t.dashboardDueToday
  return t.dashboardDueInDays.replace("{days}", String(days))
}

/** Sprint end + plan items due within 14 days (overdue first). */
export function UpcomingDue({ projectId, items }: { projectId: string; items: DueItem[] }) {
  const { t, language } = useLanguage()
  return (
    <section aria-labelledby="dashboard-due-heading" className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
      <h2 id="dashboard-due-heading" className="flex items-center gap-2 text-body font-semibold text-fg">
        <CalendarClock aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.dashboardDueTitle}
      </h2>
      {items.length === 0 ? (
        <EmptyState compact headingLevel={3} title={t.dashboardDueEmpty} />
      ) : (
        <ol className="mt-2 space-y-1">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind]
            const href = item.kind === "sprint_end" ? `/projects/${projectId}/sprints` : `/projects/${projectId}/plan`
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={href} className="flex items-start gap-2.5 rounded-ui-sm px-1.5 py-1.5 hover:bg-surface-muted">
                  <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", item.days < 0 ? "text-danger" : "text-fg-muted")} />
                  <span className="min-w-0 flex-1">
                    <I18nText as="span" className="block truncate text-body text-fg" i18n={item.i18n} field={item.nameField} original={item.name} noBadge />
                    <span className="text-caption text-fg-muted">
                      {kindLabel(item.kind, t)} · {formatLongDate(item.date, language, { utc: true })}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-caption font-semibold",
                      item.days < 0 ? "text-danger-strong" : item.days <= 2 ? "text-warning-strong" : "text-fg-muted",
                    )}
                  >
                    {whenLabel(item.days, t)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

"use client"

import { useId } from "react"
import { Button, EmptyState, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { IceboxItemCard, type IceboxCardActions } from "./icebox-item-card"
import { CircleCheck, Clock, Snowflake, type LucideIcon } from "lucide-react"
import type { IceboxItem, IceboxStatus } from "./types"

const THEME: Record<IceboxStatus, { border: string; iconBg: string; badge: string; accent: string; icon: LucideIcon }> = {
  unreviewed: { border: "border-l-amber-400", iconBg: "bg-amber-50 text-amber-700", badge: "bg-amber-100 text-amber-800", accent: "border-l-amber-300", icon: Clock },
  reviewed: { border: "border-l-emerald-400", iconBg: "bg-emerald-50 text-emerald-700", badge: "bg-emerald-100 text-emerald-800", accent: "border-l-emerald-300", icon: CircleCheck },
  completed: { border: "border-l-blue-400", iconBg: "bg-blue-50 text-blue-700", badge: "bg-blue-100 text-blue-800", accent: "border-l-blue-300", icon: CircleCheck },
  frozen: { border: "border-l-slate-400", iconBg: "bg-slate-100 text-slate-600", badge: "bg-slate-200 text-slate-700", accent: "border-l-slate-300", icon: Snowflake },
}

interface Props extends IceboxCardActions {
  projectId: string
  title: string
  status: IceboxStatus
  items: IceboxItem[]
  statusLabels: Record<string, string>
  /** Empty-state action: open the create form (only on the "unreviewed" section, where new requests land). */
  onAdd?: () => void
}

export function IceboxSection({ projectId, title, status, items, statusLabels, onAdd, ...actions }: Props) {
  const { t } = useLanguage()
  const headingId = useId()
  const theme = THEME[status]
  return (
    <section aria-labelledby={headingId} className={cn("overflow-hidden rounded-ui-lg border border-l-4 border-border bg-surface shadow-ui-sm", theme.border)}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <div className={cn("rounded-ui-sm p-1.5", theme.iconBg)}>
          <theme.icon className="h-5 w-5" />
        </div>
        <h2 id={headingId} className="text-body-lg font-semibold text-fg">
          {title}
        </h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-caption font-medium", theme.badge)}>
          {items.length}
          {t.iceboxCount}
        </span>
      </div>
      {items.length === 0 ? (
        <EmptyState
          compact
          title={t.iceboxNoItems}
          action={
            onAdd && status === "unreviewed" ? (
              <Button size="sm" variant="secondary" onClick={onAdd}>
                {t.iceboxAddRequest}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const itemTheme = THEME[item.status as IceboxStatus] ?? theme
            return (
              <IceboxItemCard
                key={item.id}
                projectId={projectId}
                item={item}
                statusLabel={statusLabels[item.status] ?? item.status}
                badgeClass={itemTheme.badge}
                accentClass={theme.accent}
                {...actions}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

"use client"

import { useMemo } from "react"
import { Users } from "lucide-react"
import { EmptyState, Truncate, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import {
  Sprint,
  ProjectMember,
  toDateStr,
  isSameDay,
  getInitials,
  datePart,
  i18nOf,
  memberGradients,
  memberBlockColors,
  sprintTextColor,
} from "./calendar-types"

interface TeamViewProps {
  members: ProjectMember[]
  sprints: Sprint[]
  calendarDays: Date[]
  currentMonth: number
  today: Date
  locale: string
}

const roleBadgeColors: Record<string, string> = {
  po: "bg-warning-soft text-warning-strong",
  sm: "bg-primary-soft text-primary-strong",
  dev: "bg-success-soft text-success-strong",
}

export default function TeamView({ members, sprints, calendarDays, currentMonth, today, locale }: TeamViewProps) {
  const { t, pt, language } = useLanguage()
  const displayDays = useMemo(() => calendarDays.slice(0, 35), [calendarDays])
  const sprintName = (sp: Sprint) => pickText(i18nOf(sp), "sprintName", sp.sprintName, language).text
  const roleLabel: Record<string, string> = { po: pt.rolePO, sm: pt.roleSM, dev: pt.roleDev }

  if (members.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <EmptyState icon={<Users className="h-6 w-6" />} title={t.calendarNoMembers} />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface">
      <div className="flex flex-1 min-h-0 overflow-auto">
        {/* Member column (sticky) */}
        <div className="w-44 shrink-0 border-r border-border bg-surface sticky left-0 z-10">
          <div className="h-10 border-b border-border bg-surface-muted flex items-center px-3">
            <span className="text-caption font-semibold text-fg-muted uppercase tracking-wider">{t.calendarMembers}</span>
          </div>
          {members.map((mem, mi) => (
            <div key={mem.id} className="h-14 flex items-center gap-2.5 px-3 border-b border-border">
              <div
                className={cn(
                  "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-caption font-bold shrink-0 shadow-ui-sm",
                  memberGradients[mi % memberGradients.length],
                )}
                aria-hidden
              >
                {getInitials(mem.user.name, mem.user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <Truncate text={mem.user.name ?? mem.user.email} className="text-caption font-semibold text-fg" />
                <span
                  className={cn(
                    "inline-block text-caption font-medium px-1.5 rounded-full mt-0.5",
                    roleBadgeColors[mem.role] ?? "bg-surface-sunken text-fg-muted",
                  )}
                >
                  {roleLabel[mem.role] ?? mem.role}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex flex-1">
          {displayDays.map((day) => {
            const dayStr = toDateStr(day)
            const isCurrentMonth = day.getMonth() === currentMonth
            const isToday = isSameDay(day, today)
            const isWeekend = day.getDay() === 0 || day.getDay() === 6
            const activeSprints = sprints.filter(
              (sp) => dayStr >= datePart(sp.startDate) && dayStr <= datePart(sp.endDate),
            )
            const hasSprint = activeSprints.length > 0
            const sprintStarting = activeSprints.find((sp) => datePart(sp.startDate) === dayStr)
            const cellTitle = hasSprint ? activeSprints.map(sprintName).join(", ") : undefined

            return (
              <div key={dayStr} className={cn("flex-1 min-w-[28px] flex flex-col", isToday && "bg-primary-soft/40")}>
                <div
                  className={cn(
                    "h-10 flex flex-col items-center justify-center border-b border-r border-border",
                    isWeekend ? "bg-surface-sunken/60" : "bg-surface-muted",
                  )}
                >
                  <span className={cn("text-caption font-medium uppercase leading-none", isCurrentMonth ? "text-fg-muted" : "text-fg-subtle")}>
                    {day.toLocaleDateString(locale, { weekday: "narrow" })}
                  </span>
                  <span
                    className={cn(
                      "text-caption font-bold leading-tight",
                      isToday
                        ? "bg-primary text-primary-fg w-5 h-5 rounded-full flex items-center justify-center"
                        : isCurrentMonth
                          ? "text-fg"
                          : "text-fg-subtle",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {members.map((mem, mi) => (
                  <div
                    key={mem.id}
                    className={cn(
                      "h-14 border-b border-r border-border relative flex items-center",
                      hasSprint && "px-0.5",
                      isWeekend && !hasSprint && "bg-surface-muted/60",
                    )}
                    title={cellTitle}
                  >
                    {hasSprint && (
                      <div
                        className={cn("absolute inset-0.5 rounded border opacity-80", memberBlockColors[mi % memberBlockColors.length])}
                        aria-hidden
                      />
                    )}
                    {sprintStarting && (
                      <span
                        className={cn(
                          "relative z-10 text-caption font-semibold truncate px-1",
                          sprintTextColor[sprintStarting.status] ?? "text-fg-muted",
                        )}
                      >
                        {sprintName(sprintStarting)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

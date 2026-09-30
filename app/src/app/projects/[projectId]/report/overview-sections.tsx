"use client"

import { useLanguage } from "@/lib/language-context"
import type { EntityI18n } from "@/lib/translation/types"
import { ROLE_ABBR, type CalendarEvent, type IceboxSummary, type Member, type ReportFormat, type ReportProductGoal } from "./types"

const EVENT_DOT: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  gray: "bg-gray-500",
}

interface ProjectOverviewProps {
  description: string | null
  projectI18n?: EntityI18n
  goals: ReportProductGoal[]
  members: Member[]
  fmt: ReportFormat
}

export function ProjectOverviewSection({ description, projectI18n, goals, members, fmt }: ProjectOverviewProps) {
  const { t } = useLanguage()
  return (
    <section className="report-section">
      <h3 className="report-heading">{t.reportProjectOverview}</h3>
      {description && (
        <p className="text-sm text-gray-800 whitespace-pre-wrap mb-4">{fmt.pick(projectI18n, "description", description)}</p>
      )}
      {goals.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">{t.dashboardProductGoals}</h4>
          <ul className="list-disc list-inside space-y-1">
            {goals.map((g) => (
              <li key={g.id} className="text-sm text-gray-800">
                <span className="font-medium">{fmt.pick(g.i18n, "title", g.title)}</span>
                {g.description && <span className="text-fg-muted"> — {fmt.pick(g.i18n, "description", g.description)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">{t.reportMembers}</h4>
        <ul className="flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50">
              <span className="font-semibold text-gray-700">{ROLE_ABBR[m.role] ?? m.role}</span>
              <span className="text-gray-800">{m.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function IceboxSection({ icebox }: { icebox: IceboxSummary }) {
  const { t, pt } = useLanguage()
  const cards = [
    { key: "unreviewed", label: t.iceboxStatusUnreviewed, value: icebox.unreviewed, cls: "bg-gray-50", text: "text-gray-800" },
    { key: "reviewed", label: t.iceboxStatusReviewed, value: icebox.reviewed, cls: "bg-blue-50", text: "text-blue-800" },
    { key: "frozen", label: t.iceboxStatusFrozen, value: icebox.frozen, cls: "bg-indigo-50", text: "text-indigo-800" },
  ]
  return (
    <section className="report-section">
      <h3 className="report-heading">{pt.iceboxTitle} - {t.sprintStatus}</h3>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.key} className={`text-center p-4 rounded-lg ${c.cls}`}>
            <div className={`text-xs font-medium ${c.text}`}>{c.label}</div>
            <div className={`text-2xl font-bold mt-1 ${c.text}`}>{c.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function UpcomingEventsSection({ events, fmt }: { events: CalendarEvent[]; fmt: ReportFormat }) {
  const { t } = useLanguage()
  return (
    <section className="report-section">
      <h3 className="report-heading">{t.reportUpcomingEvents}</h3>
      {events.length > 0 ? (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm py-1.5 border-b border-gray-100">
              <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${EVENT_DOT[ev.color] ?? "bg-gray-400"}`} />
              <span className="text-fg-muted w-24 flex-shrink-0">{fmt.formatDate(ev.date)}</span>
              <span className="font-medium text-gray-800">{fmt.pick(ev.i18n, "title", ev.title)}</span>
              {ev.description && <span className="text-fg-muted text-xs">— {fmt.pick(ev.i18n, "description", ev.description)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t.reportNoEvents}</p>
      )}
    </section>
  )
}

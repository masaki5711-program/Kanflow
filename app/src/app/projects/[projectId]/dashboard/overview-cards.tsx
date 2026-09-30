"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { ClipboardList, Lightbulb, Zap } from "lucide-react"
interface OverviewCardsProps {
  projectId: string
  iceboxCount: number
  backlogCount: number
  sprintCount: number
}

interface Card {
  path: string
  label: string
  count: number
  icon: ReactNode
  border: string
  ring: string
}

/** IceBox / Backlog / Sprints counters, each linking to its page. */
export function OverviewCards({ projectId, iceboxCount, backlogCount, sprintCount }: OverviewCardsProps) {
  const { t, pt } = useLanguage()
  const cards: Card[] = [
    { path: "icebox", label: pt.navIcebox, count: iceboxCount, icon: <Lightbulb className="w-6 h-6 text-amber-600" />, border: "border-b-amber-400", ring: "bg-amber-100" },
    { path: "backlog", label: pt.navBacklog, count: backlogCount, icon: <ClipboardList className="w-6 h-6 text-primary" />, border: "border-b-primary", ring: "bg-primary-soft" },
    { path: "sprints", label: pt.navSprints, count: sprintCount, icon: <Zap className="w-6 h-6 text-violet-600" />, border: "border-b-violet-400", ring: "bg-violet-100" },
  ]
  return (
    <section aria-labelledby="dashboard-overview-heading">
      <h2 id="dashboard-overview-heading" className="text-caption font-semibold mb-4 text-fg-muted uppercase tracking-wider">
        {t.dashboardOverview}
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <li key={card.path}>
            <Link
              href={`/projects/${projectId}/${card.path}`}
              className={`block bg-surface rounded-ui-lg border border-border border-b-[3px] ${card.border} shadow-ui-sm p-5 hover:shadow-ui-md hover:-translate-y-0.5 transition-[box-shadow,transform]`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`${card.ring} p-2.5 rounded-full`}>{card.icon}</div>
                <div className="text-caption font-semibold text-fg-muted uppercase tracking-wide">{card.label}</div>
              </div>
              <div className="text-3xl font-bold text-fg">{card.count}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"
import { ChevronRight, ClipboardList, Lightbulb, Zap } from "lucide-react"

interface OverviewCardsProps {
  projectId: string
  iceboxCount: number
  backlogCount: number
  sprintCount: number
}

interface Row {
  path: string
  label: string
  count: number
  icon: ReactNode
}

/** IceBox / Backlog / Sprints counters as a compact linked list (secondary to the sprint pulse and feed). */
export function OverviewCards({ projectId, iceboxCount, backlogCount, sprintCount }: OverviewCardsProps) {
  const { t, pt } = useLanguage()
  const rows: Row[] = [
    { path: "icebox", label: pt.navIcebox, count: iceboxCount, icon: <Lightbulb className="h-4 w-4 text-warning" /> },
    { path: "backlog", label: pt.navBacklog, count: backlogCount, icon: <ClipboardList className="h-4 w-4 text-primary" /> },
    { path: "sprints", label: pt.navSprints, count: sprintCount, icon: <Zap className="h-4 w-4 text-info" /> },
  ]
  return (
    <section aria-labelledby="dashboard-overview-heading" className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
      <h2 id="dashboard-overview-heading" className="mb-1 text-caption font-semibold uppercase tracking-wider text-fg-muted">
        {t.dashboardOverview}
      </h2>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.path}>
            <Link
              href={`/projects/${projectId}/${row.path}`}
              className="group flex items-center gap-3 rounded-ui-sm px-1 py-2 hover:bg-surface-muted"
            >
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken">{row.icon}</span>
              <span className="flex-1 text-body text-fg">{row.label}</span>
              <span className="text-title font-bold tabular-nums text-fg">{row.count}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-fg-subtle group-hover:text-fg-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { CalendarDays, CheckCheck, FolderOpen, ListChecks, Tag } from "lucide-react"
import { Button, EmptyState, buttonClasses } from "@/components/ui"
import { ProjectList } from "./project-list"
import { MySprintTasks, type MyTask } from "./my-sprint-tasks"
import { summarizeMyTasks } from "./_my-tasks/task-urgency"
import { useMyTaskStatuses } from "./_my-tasks/use-my-task-statuses"
import FixedTasksModal from "@/components/fixed-tasks-modal"
import { useLanguage } from "@/lib/language-context"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { Category, Project } from "./_project-list/types"
import type { PoHomeSummary } from "@/services/projects/po-home-summary.types"
import { HomeKpis } from "./_home-kpis/home-kpis"
import { buildHomeKpis } from "./_home-kpis/home-kpi-tiles"
import { HomeMessages } from "./_home-messages/home-messages"
import type { NotificationItem } from "@/components/notifications/notification-format"

interface Props {
  activeProjects: Project[]
  /** Archived projects are loaded on demand when their section is expanded. */
  archivedCount: number
  categories: Category[]
  isAdmin: boolean
  myTasks: MyTask[]
  userName: string | null
  /** PO numbers (A3-16); null when the user is PO of no project. */
  poSummary?: PoHomeSummary | null
  /** Newest unread messages for the viewer (mentions / assignments / comments). */
  messages?: NotificationItem[]
  /** All unread messages for the viewer. */
  messagesTotal?: number
}

export function TopPage({ activeProjects, archivedCount, categories, isAdmin, myTasks, userName, poSummary = null, messages = [], messagesTotal = 0 }: Props) {
  const { t } = useLanguage()
  useDocumentTitle([t.projectListTitle])
  const [fixedTasksOpen, setFixedTasksOpen] = useState(false)
  // One "now" per page view: urgency, KPIs and sorting agree with each other.
  const [now] = useState(() => new Date())
  const statuses = useMyTaskStatuses(myTasks)
  const kpi = summarizeMyTasks(statuses.tasks, now)
  const greeting = userName ? t.topGreetingWithName.replace("{name}", userName) : t.topGreeting

  return (
    <div className="space-y-8">
      {/* Hero: greeting + the numbers that matter today for this user's role (A3-16) */}
      <section
        aria-labelledby="top-greeting"
        className="rounded-3xl bg-gradient-to-br from-primary-active via-primary to-sky-600 px-6 py-6 text-white shadow-ui-lg md:px-8"
      >
        {/* Greeting first, the KPI cards under it (side by side they pushed the greeting below the cards). */}
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-widest text-white/80">{t.appTitle}</p>
            <h1 id="top-greeting" className="mt-1 text-2xl font-bold leading-tight md:text-3xl">{greeting}</h1>
          </div>
          <HomeKpis model={buildHomeKpis(poSummary, kpi, t)} />
        </div>
      </section>

      <FixedTasksModal open={fixedTasksOpen} onClose={() => setFixedTasksOpen(false)} />

      <HomeMessages items={messages} total={messagesTotal} />

      <section id="my-tasks" aria-labelledby="my-tasks-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle id="my-tasks-heading" icon={<CalendarDays className="h-4 w-4" />} title={t.topMyTasksHeading} subtitle={t.topMyTasksDesc} />
          <Button variant="ghost" size="sm" leftIcon={<ListChecks aria-hidden="true" className="h-4 w-4" />} onClick={() => setFixedTasksOpen(true)}>
            {t.fixedTasksManage}
          </Button>
        </div>
        {myTasks.length > 0 ? (
          <MySprintTasks tasks={myTasks} statuses={statuses} now={now} />
        ) : (
          <EmptyState
            compact
            className="rounded-2xl border border-dashed border-border bg-surface"
            icon={<CheckCheck className="h-5 w-5" />}
            title={t.topMyTasksEmpty}
          />
        )}
      </section>

      <section id="projects" aria-labelledby="projects-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle
            id="projects-heading"
            icon={<FolderOpen className="h-4 w-4" />}
            title={t.projectListTitle}
            subtitle={`${activeProjects.length} ${t.projectListCount}`}
          />
          <Link href="/settings/categories" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            <Tag aria-hidden="true" className="h-4 w-4" />
            {t.categorySettingsTitle}
          </Link>
        </div>
        <ProjectList activeProjects={activeProjects} archivedCount={archivedCount} categories={categories} isAdmin={isAdmin} />
      </section>
    </div>
  )
}

function SectionTitle({ id, icon, title, subtitle }: { id: string; icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
        {icon}
      </span>
      <div>
        <h2 id={id} className="text-title font-bold leading-tight text-fg">
          {title}
        </h2>
        <p className="text-caption text-fg-muted">{subtitle}</p>
      </div>
    </div>
  )
}

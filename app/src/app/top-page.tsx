"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { CalendarDays, CheckCheck, FolderOpen, ListChecks, Tag } from "lucide-react"
import { Button, EmptyState, buttonClasses, cn } from "@/components/ui"
import { ProjectList } from "./project-list"
import { MySprintTasks, type MyTask } from "./my-sprint-tasks"
import { summarizeMyTasks } from "./_my-tasks/task-urgency"
import { useMyTaskStatuses } from "./_my-tasks/use-my-task-statuses"
import FixedTasksModal from "@/components/fixed-tasks-modal"
import { useLanguage } from "@/lib/language-context"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { Category, Project } from "./_project-list/types"

interface Props {
  activeProjects: Project[]
  /** Archived projects are loaded on demand when their section is expanded. */
  archivedCount: number
  categories: Category[]
  isAdmin: boolean
  myTasks: MyTask[]
  userName: string | null
}

export function TopPage({ activeProjects, archivedCount, categories, isAdmin, myTasks, userName }: Props) {
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
      {/* Hero: greeting + the three numbers that matter today */}
      <section
        aria-labelledby="top-greeting"
        className="rounded-3xl bg-gradient-to-br from-primary-active via-primary to-sky-600 px-6 py-6 text-white shadow-ui-lg md:px-8"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-widest text-white/80">{t.appTitle}</p>
            <h1 id="top-greeting" className="mt-1 text-2xl font-bold leading-tight md:text-3xl">{greeting}</h1>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-2 md:gap-3">
            <Kpi label={t.topKpiOpen} value={kpi.open} />
            <Kpi label={t.topKpiOverdue} value={kpi.overdue} alert={kpi.overdue > 0} />
            <Kpi label={t.topKpiDueThisWeek} value={kpi.dueThisWeek} />
          </dl>
        </div>
      </section>

      <FixedTasksModal open={fixedTasksOpen} onClose={() => setFixedTasksOpen(false)} />

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

function Kpi({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-[88px] flex-col-reverse rounded-2xl px-3 py-2 text-center backdrop-blur md:px-4 md:py-3",
        alert ? "bg-white text-danger-strong shadow-ui-md" : "bg-white/15",
      )}
    >
      {/* Wraps onto two lines instead of "Tugas terb…" at 375 px (A3-17). */}
      <dt data-testid="kpi-label" className={cn("mt-1 break-words text-caption leading-tight", alert ? "font-semibold" : "text-white/90")} title={label}>
        {label}
      </dt>
      <dd className="text-2xl font-bold leading-none md:text-3xl">{value}</dd>
    </div>
  )
}

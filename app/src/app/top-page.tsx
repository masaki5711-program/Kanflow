"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { CalendarDays, CheckCheck, FolderOpen, Languages, ListChecks, Tag, UserRound } from "lucide-react"
import { Badge, EmptyState } from "@/components/ui"
import { ProjectList } from "./project-list"
import { MySprintTasks, type MyTask } from "./my-sprint-tasks"
import FixedTasksModal from "@/components/fixed-tasks-modal"
import { useLanguage } from "@/lib/language-context"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { type Language, languageLabels } from "@/lib/i18n"
import type { Category, Project } from "./_project-list/types"

interface Props {
  activeProjects: Project[]
  archivedProjects: Project[]
  categories: Category[]
  isAdmin: boolean
  myTasks: MyTask[]
  userName: string | null
}

const HERO_CHIP =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-caption text-white backdrop-blur transition-colors hover:bg-white/25"

export function TopPage({ activeProjects, archivedProjects, categories, isAdmin, myTasks, userName }: Props) {
  const { t, language, setLanguage } = useLanguage()
  useDocumentTitle([t.projectListTitle])
  const [fixedTasksOpen, setFixedTasksOpen] = useState(false)

  const inProgressCount = myTasks.filter((m) => m.status === "in_progress").length
  const todoCount = myTasks.filter((m) => m.status === "todo").length
  const doneCount = myTasks.filter((m) => m.status === "done").length
  const activeProjectCount = activeProjects.length
  const greeting = userName ? t.topGreetingWithName.replace("{name}", userName) : t.topGreeting

  return (
    <div className="space-y-8">
      {/* Hero / Welcome */}
      <section className="rounded-3xl bg-gradient-to-br from-primary-active via-primary to-sky-600 px-6 py-7 text-white shadow-ui-lg md:px-8 md:py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-widest text-white/80">{t.appTitle}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight md:text-3xl">{greeting}</h1>
            <p className="mt-1 text-body text-white/90">{t.topMyTasksDesc}</p>
          </div>

          <dl className="grid shrink-0 grid-cols-3 gap-2 md:gap-3">
            <StatTile label={t.taskInProgress} value={inProgressCount} />
            <StatTile label={t.taskTodo} value={todoCount} />
            <StatTile label={t.topStatActiveProjects} value={activeProjectCount} />
          </dl>
        </div>

        {/* Toolbar inside hero */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <label className={HERO_CHIP}>
            <Languages aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">{t.topLanguageLabel}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="cursor-pointer bg-transparent text-caption text-white [&>option]:text-fg"
            >
              {(Object.entries(languageLabels) as [Language, string][]).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Link href="/settings/categories" className={HERO_CHIP}>
            <Tag aria-hidden="true" className="h-3.5 w-3.5" />
            {t.categorySettingsTitle}
          </Link>
          <Link href="/me" className={HERO_CHIP}>
            <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
            {t.myProfileMenu}
          </Link>
          <button type="button" onClick={() => setFixedTasksOpen(true)} className={HERO_CHIP}>
            <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
            {t.fixedTasksManage}
          </button>
        </div>
      </section>

      <FixedTasksModal open={fixedTasksOpen} onClose={() => setFixedTasksOpen(false)} />

      {/* My Tasks section */}
      <section id="my-tasks" aria-labelledby="my-tasks-heading">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle
            id="my-tasks-heading"
            icon={<CalendarDays className="h-4 w-4" />}
            title={t.topMyTasksHeading}
            subtitle={t.topMyTasksDesc}
          />
          {myTasks.length > 0 && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {inProgressCount > 0 && <Badge tone="primary">{t.taskInProgress} {inProgressCount}</Badge>}
              {todoCount > 0 && <Badge tone="neutral">{t.taskTodo} {todoCount}</Badge>}
              {doneCount > 0 && <Badge tone="success">{t.taskDone} {doneCount}</Badge>}
            </div>
          )}
        </div>
        {myTasks.length > 0 ? (
          <MySprintTasks tasks={myTasks} />
        ) : (
          <EmptyState
            compact
            className="rounded-2xl border border-dashed border-border bg-surface"
            icon={<CheckCheck className="h-5 w-5" />}
            title={t.topMyTasksEmpty}
          />
        )}
      </section>

      {/* Projects section */}
      <section id="projects" aria-labelledby="projects-heading">
        <div className="mb-3">
          <SectionTitle
            id="projects-heading"
            icon={<FolderOpen className="h-4 w-4" />}
            title={t.projectListTitle}
            subtitle={`${activeProjectCount} ${t.projectListCount}`}
          />
        </div>
        <ProjectList
          activeProjects={activeProjects}
          archivedProjects={archivedProjects}
          categories={categories}
          isAdmin={isAdmin}
        />
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[72px] flex-col-reverse rounded-2xl bg-white/15 px-3 py-2 text-center backdrop-blur md:px-4 md:py-3">
      <dt className="mt-1 truncate text-caption text-white/90" title={label}>
        {label}
      </dt>
      <dd className="text-xl font-bold leading-none md:text-2xl">{value}</dd>
    </div>
  )
}

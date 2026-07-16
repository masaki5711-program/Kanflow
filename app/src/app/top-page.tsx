"use client"

import Link from "next/link"
import { useState } from "react"
import { ProjectList } from "./project-list"
import { MySprintTasks, type MyTask } from "./my-sprint-tasks"
import FixedTasksModal from "@/components/fixed-tasks-modal"
import { useLanguage } from "@/lib/language-context"
import { type Language, languageLabels } from "@/lib/i18n"

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  projectType: string
  members: {
    role: string
    user: { id: string; name: string }
  }[]
  _count: {
    iceboxItems: number
    backlogItems: number
    sprints: number
  }
  progressPct: number
  sections?: { id: string; name: string }[]
  isFavorite?: boolean
}

interface Category {
  id: string
  name: string
  color: string
  sortOrder: number
  assignments: { projectId: string }[]
}

interface Props {
  activeProjects: Project[]
  archivedProjects: Project[]
  categories: Category[]
  isAdmin: boolean
  myTasks: MyTask[]
  userName: string | null
}

export function TopPage({ activeProjects, archivedProjects, categories, isAdmin, myTasks, userName }: Props) {
  const { t, language, setLanguage } = useLanguage()
  const [fixedTasksOpen, setFixedTasksOpen] = useState(false)

  const inProgressCount = myTasks.filter((m) => m.status === "in_progress").length
  const todoCount = myTasks.filter((m) => m.status === "todo").length
  const doneCount = myTasks.filter((m) => m.status === "done").length
  const activeProjectCount = activeProjects.length

  return (
    <div className="space-y-8">
      {/* Hero / Welcome */}
      <section className="rounded-3xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 px-6 py-7 md:px-8 md:py-8 text-white shadow-lg shadow-indigo-200/40">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/70 font-medium">{t.appTitle}</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold leading-tight">
              {t.topGreeting}{userName ? `、${userName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-white/80">{t.topMyTasksDesc}</p>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2 md:gap-3 shrink-0">
            <StatTile label={t.taskInProgress} value={inProgressCount} />
            <StatTile label={t.taskTodo} value={todoCount} />
            <StatTile label={t.topStatActiveProjects} value={activeProjectCount} />
          </div>
        </div>

        {/* Toolbar inside hero */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs text-white/90">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.69.914 1.005a1 1 0 11-1.414 1.414 17.1 17.1 0 01-.69-.698A18.96 18.96 0 013.834 15.1a1 1 0 01-1.668-1.1 16.96 16.96 0 002.47-2.93A18.88 18.88 0 013.2 8H2a1 1 0 010-2h3V3a1 1 0 011-1zm6 6a1 1 0 011 1v.01a1 1 0 01-1 .99H13a1 1 0 010-2zm-1 4a1 1 0 00-.894.553l-2 4a1 1 0 001.788.894L11.382 16h3.236l.488.447a1 1 0 001.788-.894l-2-4A1 1 0 0014 12h-2z" clipRule="evenodd"/>
            </svg>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer [&>option]:text-gray-800"
            >
              {(Object.entries(languageLabels) as [Language, string][]).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <Link
            href="/settings/categories"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs text-white/90 hover:bg-white/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
            </svg>
            {t.categorySettingsTitle}
          </Link>
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs text-white/90 hover:bg-white/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
            </svg>
            {t.myProfileMenu}
          </Link>
          <button
            type="button"
            onClick={() => setFixedTasksOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs text-white/90 hover:bg-white/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd"/>
            </svg>
            {t.fixedTasksManage}
          </button>
        </div>
      </section>

      <FixedTasksModal open={fixedTasksOpen} onClose={() => setFixedTasksOpen(false)} />

      {/* My Tasks section */}
      <section id="my-tasks">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex w-8 h-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
              </svg>
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">{t.navSprints} - {t.sprintTasks}</h2>
              <p className="text-xs text-gray-500">{t.topMyTasksDesc}</p>
            </div>
          </div>
          {myTasks.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              {inProgressCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                  {t.taskInProgress} {inProgressCount}
                </span>
              )}
              {todoCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                  {t.taskTodo} {todoCount}
                </span>
              )}
              {doneCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  {t.taskDone} {doneCount}
                </span>
              )}
            </div>
          )}
        </div>
        {myTasks.length > 0 ? (
          <MySprintTasks tasks={myTasks} />
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
            <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-3">
              <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd"/>
              </svg>
            </div>
            <p className="text-sm text-gray-500">{t.topMyTasksEmpty}</p>
          </div>
        )}
      </section>

      {/* Projects section */}
      <section id="projects">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
          </span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{t.projectListTitle}</h2>
            <p className="text-xs text-gray-500">{activeProjectCount} {t.projectListCount}</p>
          </div>
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/15 backdrop-blur px-3 py-2 md:px-4 md:py-3 text-center min-w-[72px]">
      <div className="text-xl md:text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] md:text-xs text-white/80 truncate">{label}</div>
    </div>
  )
}

"use client"

import Link from "next/link"
import { ProjectList } from "./project-list"
import { MySprintTasks, type MyTask } from "./my-sprint-tasks"
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
}

export function TopPage({ activeProjects, archivedProjects, categories, isAdmin, myTasks }: Props) {
  const { t, language, setLanguage } = useLanguage()

  return (
    <div>
      {myTasks.length > 0 && <MySprintTasks tasks={myTasks} />}

      {/* Language selector + Category settings link */}
      <div className="flex items-center justify-end gap-3 mb-4">
        <div className="inline-flex items-center gap-1.5 text-sm text-gray-500">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.69.914 1.005a1 1 0 11-1.414 1.414 17.1 17.1 0 01-.69-.698A18.96 18.96 0 013.834 15.1a1 1 0 01-1.668-1.1 16.96 16.96 0 002.47-2.93A18.88 18.88 0 013.2 8H2a1 1 0 010-2h3V3a1 1 0 011-1zm6 6a1 1 0 011 1v.01a1 1 0 01-1 .99H13a1 1 0 010-2zm-1 4a1 1 0 00-.894.553l-2 4a1 1 0 001.788.894L11.382 16h3.236l.488.447a1 1 0 001.788-.894l-2-4A1 1 0 0014 12h-2z" clipRule="evenodd"/>
          </svg>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-600 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {(Object.entries(languageLabels) as [Language, string][]).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <Link
          href="/settings/categories"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
          </svg>
          {t.categorySettingsTitle}
        </Link>
      </div>

      <ProjectList
        activeProjects={activeProjects}
        archivedProjects={archivedProjects}
        categories={categories}
        isAdmin={isAdmin}
      />
    </div>
  )
}

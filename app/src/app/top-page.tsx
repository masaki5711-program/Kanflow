"use client"

import Link from "next/link"
import { ProjectList } from "./project-list"
import { MySprintTasks, type MyTask } from "./my-sprint-tasks"
import { useLanguage } from "@/lib/language-context"

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
  const { t } = useLanguage()

  return (
    <div>
      {myTasks.length > 0 && <MySprintTasks tasks={myTasks} />}

      {/* Category settings link */}
      <div className="flex justify-end mb-4">
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

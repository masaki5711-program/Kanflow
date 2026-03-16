"use client"

import { useState } from "react"
import { ProjectList } from "./project-list"
import { UserManagementInline } from "./user-management-inline"
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

type Mode = "projects" | "users"

interface Props {
  activeProjects: Project[]
  archivedProjects: Project[]
  categories: Category[]
  isAdmin: boolean
  myTasks: MyTask[]
}

export function TopPage({ activeProjects, archivedProjects, categories, isAdmin, myTasks }: Props) {
  const { t } = useLanguage()
  const [mode, setMode] = useState<Mode>("projects")

  return (
    <div>
      {myTasks.length > 0 && <MySprintTasks tasks={myTasks} />}

      {isAdmin && (
        <div className="flex justify-center mb-6">
          <div className="flex bg-gray-100 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setMode("projects")}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "projects"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                </svg>
                {t.projectListTitle}
              </span>
            </button>
            <button
              onClick={() => setMode("users")}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "users"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                </svg>
                {t.userManagementTitle}
              </span>
            </button>
          </div>
        </div>
      )}

      {mode === "projects" ? (
        <ProjectList
          activeProjects={activeProjects}
          archivedProjects={archivedProjects}
          categories={categories}
          isAdmin={isAdmin}
        />
      ) : (
        <UserManagementInline />
      )}
    </div>
  )
}

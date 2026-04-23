"use client"

import { useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { type ProjectType, projectTypeOptions } from "@/lib/project-type-labels"
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
  progressPct: number
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
}

const colorMap: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  red: "bg-red-50 text-red-700 border-red-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  green: "bg-green-50 text-green-700 border-green-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  pink: "bg-pink-50 text-pink-700 border-pink-200",
}

const colorDot: Record<string, string> = {
  gray: "bg-gray-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
}

export function ProjectList({ activeProjects, archivedProjects, categories, isAdmin }: Props) {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [projectType, setProjectType] = useState<ProjectType>("software")
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  const [viewMode, setViewMode] = useState<"flat" | "category">("flat")
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null)
  const [localCategories, setLocalCategories] = useState(categories)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const savedMode = localStorage.getItem("projectViewMode")
    if (savedMode === "flat" || savedMode === "category") setViewMode(savedMode)
    try {
      const savedSections = localStorage.getItem("collapsedSections")
      if (savedSections) setCollapsedSections(JSON.parse(savedSections))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    function handleClick() { setContextMenu(null) }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem("projectViewMode", viewMode)
  }, [viewMode, hydrated])

  useEffect(() => {
    if (hydrated) localStorage.setItem("collapsedSections", JSON.stringify(collapsedSections))
  }, [collapsedSections, hydrated])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  function toggleSection(key: string) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, projectType }),
      })
      if (res.ok) {
        setShowCreate(false)
        setName("")
        setDescription("")
        setProjectType("software")
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  function startEditing(e: React.MouseEvent, project: Project) {
    e.preventDefault()
    e.stopPropagation()
    setEditingId(project.id)
    setEditName(project.name)
  }

  async function handleRename(projectId: string) {
    const trimmed = editName.trim()
    if (!trimmed) { setEditingId(null); return }
    const original = activeProjects.find((p) => p.id === projectId) ?? archivedProjects.find((p) => p.id === projectId)
    if (original && trimmed === original.name) { setEditingId(null); return }
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) { setEditingId(null); router.refresh() }
    } catch { setEditingId(null) }
  }

  function handleEditKeyDown(e: React.KeyboardEvent, projectId: string) {
    if (e.key === "Enter") { e.preventDefault(); handleRename(projectId) }
    else if (e.key === "Escape") setEditingId(null)
  }

  const roleStyle: Record<string, string> = {
    po: "bg-amber-50 text-amber-700 ring-amber-200",
    sm: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dev: "bg-slate-50 text-slate-600 ring-slate-200",
  }
  const roleLabel: Record<string, string> = { po: "PO", sm: "SM", dev: "Dev" }

  function getCategoryBadges(projectId: string) {
    return localCategories.filter((c) => c.assignments.some((a) => a.projectId === projectId))
  }

  function handleContextMenu(e: React.MouseEvent, projectId: string) {
    if (localCategories.length === 0) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  async function toggleCategoryAssignment(categoryId: string, projectId: string) {
    const cat = localCategories.find((c) => c.id === categoryId)
    if (!cat) return

    const isAssigned = cat.assignments.some((a) => a.projectId === projectId)

    if (isAssigned) {
      await fetch(`/api/user/categories/${categoryId}/assignments?projectId=${projectId}`, {
        method: "DELETE",
      })
      setLocalCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, assignments: c.assignments.filter((a) => a.projectId !== projectId) }
            : c
        )
      )
    } else {
      await fetch(`/api/user/categories/${categoryId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      })
      setLocalCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, assignments: [...c.assignments, { projectId }] }
            : c
        )
      )
    }
  }

  function renderProjectCard(project: Project) {
    const badges = getCategoryBadges(project.id)
    return (
      <div
        key={project.id}
        onClick={() => { if (editingId !== project.id) router.push(`/projects/${project.id}`) }}
        onContextMenu={(e) => handleContextMenu(e, project.id)}
        className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 p-6 transition-all cursor-pointer"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editingId === project.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRename(project.id)}
                onKeyDown={(e) => handleEditKeyDown(e, project.id)}
                className="text-lg font-semibold text-gray-900 w-full px-3 py-1.5 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            ) : (
              <div className="flex items-center gap-2 group/name">
                <span className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {project.name}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                  {project.projectType === "software" ? "💻" : project.projectType === "process_improvement" ? "🏭" : "📋"}
                </span>
                <button
                  onClick={(e) => startEditing(e, project)}
                  className="opacity-0 group-hover/name:opacity-100 p-1 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-all"
                  title={t.projectEditName}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                  </svg>
                </button>
              </div>
            )}
            {project.description && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
            )}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {badges.map((cat) => (
                  <span
                    key={cat.id}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colorMap[cat.color] ?? colorMap.gray}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${colorDot[cat.color] ?? colorDot.gray}`} />
                    {cat.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs shrink-0">
            <div className="flex items-center gap-1.5 text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5z" clipRule="evenodd"/>
              </svg>
              <span>{project._count.iceboxItems}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clipRule="evenodd"/>
              </svg>
              <span>{project._count.backlogItems}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
              </svg>
              <span>{project._count.sprints}</span>
            </div>
          </div>
        </div>
        {/* Progress bar — manually set by PO on the dashboard */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">{t.projectProgress}</span>
            <span className="font-semibold text-emerald-600">{Math.min(100, Math.max(0, project.progressPct))}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, project.progressPct))}%` }}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {project.members.map((m) => (
            <span
              key={m.user.id}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ring-1 ring-inset font-medium ${
                roleStyle[m.role] ?? "bg-gray-50 text-gray-600 ring-gray-200"
              }`}
            >
              {m.user.name}
              <span className="opacity-60">{roleLabel[m.role] ?? m.role}</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  function renderSectionHeader(title: string, key: string, count: number, dotColor?: string) {
    const isCollapsed = collapsedSections[key]
    return (
      <button
        onClick={() => toggleSection(key)}
        className="flex items-center gap-2 w-full text-left py-2 group/section"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
        </svg>
        {dotColor && <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-xs text-gray-400 font-normal">({count})</span>
      </button>
    )
  }

  function renderCategoryView() {
    const categorized = new Set<string>()
    const sections: { key: string; title: string; dotColor?: string; projects: Project[] }[] = []

    for (const cat of localCategories) {
      const projectIds = new Set(cat.assignments.map((a) => a.projectId))
      const catProjects = activeProjects.filter((p) => projectIds.has(p.id))
      catProjects.forEach((p) => categorized.add(p.id))
      if (catProjects.length > 0) {
        sections.push({
          key: `cat-${cat.id}`,
          title: cat.name,
          dotColor: colorDot[cat.color] ?? colorDot.gray,
          projects: catProjects,
        })
      }
    }

    const uncategorized = activeProjects.filter((p) => !categorized.has(p.id))
    if (uncategorized.length > 0) {
      sections.push({ key: "uncategorized", title: t.categoryUncategorized, projects: uncategorized })
    }

    return (
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.key}>
            {renderSectionHeader(section.title, section.key, section.projects.length, section.dotColor)}
            {!collapsedSections[section.key] && (
              <div className="grid gap-3 mt-2 ml-6">
                {section.projects.map(renderProjectCard)}
              </div>
            )}
          </div>
        ))}
        {sections.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">
            {t.projectListNoActive}
          </div>
        )}
      </div>
    )
  }

  function renderFlatView() {
    if (activeProjects.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700 mb-1">{t.projectListEmpty}</p>
          <p className="text-sm text-gray-500">{t.projectListGetStarted}</p>
        </div>
      )
    }
    return <div className="grid gap-4">{activeProjects.map(renderProjectCard)}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.projectListTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeProjects.length > 0
              ? `${activeProjects.length} ${t.projectListCount}`
              : t.projectListGetStarted}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {localCategories.length > 0 && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("flat")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === "flat"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.categoryFlat}
              </button>
              <button
                onClick={() => setViewMode("category")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === "category"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.categoryCategory}
              </button>
            </div>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 text-sm font-medium shadow-sm shadow-blue-500/25 hover:shadow-md transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            {t.projectCreateButton}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t.projectCreateTitle}</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.projectType}</label>
              <div className="grid grid-cols-3 gap-3">
                {projectTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProjectType(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      projectType === opt.value
                        ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-lg mb-1">
                      {opt.value === "software" ? "\uD83D\uDCBB" : opt.value === "process_improvement" ? "\uD83C\uDFED" : "\uD83D\uDCCB"}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">{language === "ja" ? opt.labelJa : language === "id" ? opt.labelId : opt.labelEn}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{language === "ja" ? opt.descJa : language === "id" ? opt.descId : opt.descEn}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.projectName}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={t.projectNamePlaceholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.projectDescription}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t.projectDescriptionPlaceholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm">
                {t.create}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm font-medium">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {viewMode === "category" && localCategories.length > 0 ? renderCategoryView() : renderFlatView()}

      {archivedProjects.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showArchived ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
            </svg>
            {t.sprintStatusArchived} ({archivedProjects.length})
          </button>
          {showArchived && (
            <div className="grid gap-4 mt-4">
              {archivedProjects.map((project) => (
                <div key={project.id} className="opacity-60">
                  {renderProjectCard(project)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {contextMenu && localCategories.length > 0 && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-2 min-w-[200px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t.categoryCategory}
          </div>
          {localCategories.map((cat) => {
            const isAssigned = cat.assignments.some((a) => a.projectId === contextMenu.projectId)
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategoryAssignment(cat.id, contextMenu.projectId)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className={`w-3 h-3 rounded-full ${colorDot[cat.color] ?? colorDot.gray}`} />
                <span className="flex-1 text-left">{cat.name}</span>
                {isAssigned && (
                  <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

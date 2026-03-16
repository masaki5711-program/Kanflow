"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"

interface ProductGoal {
  id: string
  title: string
  description: string | null
}

interface Attachment {
  id: string
  originalName: string
  fileName: string
  fileSize: number
  mimeType: string
  folderId: string | null
  createdAt: string
}

interface Folder {
  id: string
  name: string
  attachments: Attachment[]
}

interface DashboardContentProps {
  projectId: string
  projectName: string
  projectDescription: string | null
  productGoals: ProductGoal[]
  folders: Folder[]
  attachments: Attachment[]
  iceboxCount: number
  backlogCount: number
  sprintCount: number
  activeSprint: {
    name: string
    goal: string | null
    startDate: string
    endDate: string
    capacity: number
    taskCounts: {
      todo: number
      inProgress: number
      done: number
    }
  } | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼"
  if (mimeType === "application/pdf") return "📄"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "📊"
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽"
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝"
  return "📎"
}

function isEditableInBrowser(mimeType: string): boolean {
  return (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  )
}

export function DashboardContent({
  projectId,
  projectName,
  projectDescription,
  productGoals: initialGoals,
  folders: initialFolders,
  attachments: initialAttachments,
  iceboxCount,
  backlogCount,
  sprintCount,
  activeSprint,
}: DashboardContentProps) {
  const { t, pt } = useLanguage()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Description editing
  const [description, setDescription] = useState(projectDescription ?? "")
  const [editingDescription, setEditingDescription] = useState(false)
  const [descSaving, setDescSaving] = useState(false)

  // Product goals
  const [goals, setGoals] = useState<ProductGoal[]>(initialGoals)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ title: "", description: "" })
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)

  // Folders & Attachments
  const [folders, setFolders] = useState<Folder[]>(initialFolders)
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [uploading, setUploading] = useState(false)
  const [uploadingFolderId, setUploadingFolderId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState("")
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(initialFolders.map((f) => f.id)))
  const folderFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Save description
  const saveDescription = useCallback(async () => {
    setDescSaving(true)
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      })
      setEditingDescription(false)
    } finally {
      setDescSaving(false)
    }
  }, [projectId, description])

  // Goal CRUD
  async function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = editingGoalId
      ? `/api/projects/${projectId}/goals/${editingGoalId}`
      : `/api/projects/${projectId}/goals`
    const method = editingGoalId ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goalForm),
    })
    if (res.ok) {
      const saved = await res.json()
      if (editingGoalId) {
        setGoals(goals.map((g) => (g.id === editingGoalId ? saved : g)))
      } else {
        setGoals([...goals, saved])
      }
      setGoalForm({ title: "", description: "" })
      setShowGoalForm(false)
      setEditingGoalId(null)
    }
  }

  async function handleDeleteGoal(goalId: string) {
    if (!confirm(t.delete + "?")) return
    const res = await fetch(`/api/projects/${projectId}/goals/${goalId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setGoals(goals.filter((g) => g.id !== goalId))
    }
  }

  function startEditGoal(goal: ProductGoal) {
    setEditingGoalId(goal.id)
    setGoalForm({ title: goal.title, description: goal.description ?? "" })
    setShowGoalForm(true)
  }

  // File upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, folderId?: string | null) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadingFolderId(folderId ?? null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      if (folderId) formData.append("folderId", folderId)

      const res = await fetch(`/api/projects/${projectId}/attachments`, {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        const saved = await res.json()
        if (folderId) {
          setFolders(folders.map((f) =>
            f.id === folderId ? { ...f, attachments: [saved, ...f.attachments] } : f
          ))
        } else {
          setAttachments([saved, ...attachments])
        }
      } else {
        const err = await res.json()
        alert(err.error ?? t.error)
      }
    } finally {
      setUploading(false)
      setUploadingFolderId(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      const ref = folderId ? folderFileInputRefs.current[folderId] : null
      if (ref) ref.value = ""
    }
  }

  async function handleDeleteAttachment(attachmentId: string, folderId?: string | null) {
    if (!confirm(t.dashboardDeleteAttachmentConfirm)) return
    const res = await fetch(
      `/api/projects/${projectId}/attachments/${attachmentId}`,
      { method: "DELETE" }
    )
    if (res.ok) {
      if (folderId) {
        setFolders(folders.map((f) =>
          f.id === folderId ? { ...f, attachments: f.attachments.filter((a) => a.id !== attachmentId) } : f
        ))
      } else {
        setAttachments(attachments.filter((a) => a.id !== attachmentId))
      }
    }
  }

  // Folder operations
  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return

    const res = await fetch(`/api/projects/${projectId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim() }),
    })
    if (res.ok) {
      const folder = await res.json()
      setFolders([...folders, folder])
      setOpenFolders((prev) => new Set([...prev, folder.id]))
      setNewFolderName("")
      setShowNewFolder(false)
    }
  }

  async function handleRenameFolder(folderId: string) {
    const trimmed = editFolderName.trim()
    if (!trimmed) {
      setEditingFolderId(null)
      return
    }
    const res = await fetch(`/api/projects/${projectId}/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      setFolders(folders.map((f) => f.id === folderId ? { ...f, name: trimmed } : f))
      setEditingFolderId(null)
    }
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm(t.folderDeleteConfirm)) return
    const folder = folders.find((f) => f.id === folderId)
    const res = await fetch(`/api/projects/${projectId}/folders/${folderId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      if (folder) {
        const movedFiles = folder.attachments.map((a) => ({ ...a, folderId: null }))
        setAttachments([...movedFiles, ...attachments])
      }
      setFolders(folders.filter((f) => f.id !== folderId))
    }
  }

  function toggleFolder(folderId: string) {
    const next = new Set(openFolders)
    if (next.has(folderId)) {
      next.delete(folderId)
    } else {
      next.add(folderId)
    }
    setOpenFolders(next)
  }

  async function handleMoveToFolder(attachmentId: string, targetFolderId: string | null, sourceFolderId: string | null) {
    const res = await fetch(`/api/projects/${projectId}/attachments/${attachmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: targetFolderId }),
    })
    if (res.ok) {
      let movedFile: Attachment | undefined
      if (sourceFolderId) {
        const sourceFolder = folders.find((f) => f.id === sourceFolderId)
        movedFile = sourceFolder?.attachments.find((a) => a.id === attachmentId)
        setFolders(folders.map((f) =>
          f.id === sourceFolderId ? { ...f, attachments: f.attachments.filter((a) => a.id !== attachmentId) } : f
        ))
      } else {
        movedFile = attachments.find((a) => a.id === attachmentId)
        setAttachments(attachments.filter((a) => a.id !== attachmentId))
      }
      if (movedFile && targetFolderId) {
        const updated = { ...movedFile, folderId: targetFolderId }
        setFolders((prev) => prev.map((f) =>
          f.id === targetFolderId ? { ...f, attachments: [updated, ...f.attachments] } : f
        ))
      } else if (movedFile && !targetFolderId) {
        setAttachments((prev) => [{ ...movedFile!, folderId: null }, ...prev])
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.dashboardTitle}</h1>
        <a
          href={`/projects/${projectId}/report`}
          className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 text-sm font-medium"
        >
          {t.reportTitle}
        </a>
      </div>

      {/* Project Info Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-base font-semibold mb-3 text-gray-500 uppercase tracking-wider text-xs">
          {t.dashboardProjectInfo}
        </h2>
        <h3 className="text-xl font-bold text-gray-900 mb-3">{projectName}</h3>

        {/* Description */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">
            {t.dashboardDescription}
          </label>
          {editingDescription ? (
            <div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={t.dashboardDescriptionPlaceholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveDescription}
                  disabled={descSaving}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm disabled:opacity-50"
                >
                  {descSaving ? t.saving : t.save}
                </button>
                <button
                  onClick={() => {
                    setDescription(projectDescription ?? "")
                    setEditingDescription(false)
                  }}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setEditingDescription(true)}
              className="min-h-[60px] px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-pre-wrap"
            >
              {description || (
                <span className="text-gray-400">{t.dashboardDescriptionPlaceholder}</span>
              )}
            </div>
          )}
        </div>

        {/* Product Goals */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-600">
              {t.dashboardProductGoals}
            </label>
            <button
              onClick={() => {
                setGoalForm({ title: "", description: "" })
                setEditingGoalId(null)
                setShowGoalForm(!showGoalForm)
              }}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t.dashboardAddGoal}
            </button>
          </div>

          {showGoalForm && (
            <form onSubmit={handleGoalSubmit} className="bg-gray-50 rounded-md p-3 mb-3 space-y-2">
              <input
                type="text"
                value={goalForm.title}
                onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                required
                placeholder={t.dashboardProductGoals}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={goalForm.description}
                onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                rows={2}
                placeholder={t.dashboardDescription}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                  {editingGoalId ? t.update : t.add}
                </button>
                <button type="button" onClick={() => { setShowGoalForm(false); setEditingGoalId(null) }} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">
                  {t.cancel}
                </button>
              </div>
            </form>
          )}

          {goals.length > 0 ? (
            <div className="space-y-2">
              {goals.map((goal) => (
                <div key={goal.id} className="bg-gray-50 rounded-md p-3 group">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{goal.title}</p>
                      {goal.description && (
                        <p className="text-xs text-gray-500 mt-1">{goal.description}</p>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={() => startEditGoal(goal)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-1"
                      >
                        {t.edit}
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-1"
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t.dashboardNoGoals}</p>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {t.dashboardAttachments}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewFolder(true)}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
            >
              {t.folderNew}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => handleFileUpload(e)}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading && !uploadingFolderId}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading && !uploadingFolderId ? t.loading : t.dashboardUploadFile}
            </button>
          </div>
        </div>

        {/* New folder form */}
        {showNewFolder && (
          <form onSubmit={handleCreateFolder} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t.folderName}
              autoFocus
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t.create}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewFolder(false); setNewFolderName("") }}
              className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              {t.cancel}
            </button>
          </form>
        )}

        {/* Folders */}
        {folders.map((folder) => (
          <div key={folder.id} className="mb-3 border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 group/folder">
              <button
                onClick={() => toggleFolder(folder.id)}
                className="text-gray-500 text-sm w-5 text-center"
              >
                {openFolders.has(folder.id) ? "▼" : "▶"}
              </button>
              <span className="text-sm">📁</span>
              {editingFolderId === folder.id ? (
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  onBlur={() => handleRenameFolder(folder.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFolder(folder.id)
                    if (e.key === "Escape") setEditingFolderId(null)
                  }}
                  autoFocus
                  className="flex-1 px-2 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <span
                  className="flex-1 text-sm font-medium text-gray-700 cursor-pointer"
                  onClick={() => toggleFolder(folder.id)}
                >
                  {folder.name}
                  <span className="text-xs text-gray-400 ml-2">({folder.attachments.length})</span>
                </span>
              )}
              <div className="opacity-0 group-hover/folder:opacity-100 flex gap-1 transition-opacity">
                <input
                  ref={(el) => { folderFileInputRefs.current[folder.id] = el }}
                  type="file"
                  onChange={(e) => handleFileUpload(e, folder.id)}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
                />
                <button
                  onClick={() => folderFileInputRefs.current[folder.id]?.click()}
                  disabled={uploading && uploadingFolderId === folder.id}
                  className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                  title={t.dashboardUploadFile}
                >
                  {uploading && uploadingFolderId === folder.id ? "..." : "+"}
                </button>
                <button
                  onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }}
                  className="text-xs text-gray-400 hover:text-blue-600 px-1"
                  title={t.folderEditName}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="text-xs text-gray-400 hover:text-red-600 px-1"
                  title={t.folderDeleteTitle}
                >
                  ✕
                </button>
              </div>
            </div>

            {openFolders.has(folder.id) && (
              <div className="px-3 py-1">
                {folder.attachments.length > 0 ? (
                  <div className="space-y-1">
                    {folder.attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 bg-gray-50 rounded-md px-3 py-2 group"
                      >
                        <span className="text-lg">{getFileIcon(file.mimeType)}</span>
                        <div className="flex-1 min-w-0">
                          <a
                            href={`/api/projects/${projectId}/attachments/${file.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block"
                          >
                            {file.originalName}
                          </a>
                          <div className="flex gap-3 text-xs text-gray-400">
                            <span>{formatFileSize(file.fileSize)}</span>
                            <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {isEditableInBrowser(file.mimeType) && (
                          <button
                            onClick={() => router.push(`/projects/${projectId}/editor/${file.id}`)}
                            className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded transition-opacity"
                          >
                            {t.edit}
                          </button>
                        )}
                        <select
                          onChange={(e) => {
                            if (e.target.value === "__unfiled__") {
                              handleMoveToFolder(file.id, null, folder.id)
                            } else if (e.target.value) {
                              handleMoveToFolder(file.id, e.target.value, folder.id)
                            }
                            e.target.value = ""
                          }}
                          defaultValue=""
                          className="opacity-0 group-hover:opacity-100 text-xs border border-gray-300 rounded px-1 py-0.5 transition-opacity"
                          title={t.folderMoveTo}
                        >
                          <option value="" disabled>{t.folderMoveTo}</option>
                          <option value="__unfiled__">{t.folderUnfiled}</option>
                          {folders.filter((f) => f.id !== folder.id).map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                        <a
                          href={`/api/projects/${projectId}/attachments/${file.id}/download`}
                          download
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity"
                          title={t.dashboardDownload}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                          </svg>
                        </a>
                        <button
                          onClick={() => handleDeleteAttachment(file.id, folder.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-opacity"
                        >
                          {t.delete}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-2">{t.folderNoFiles}</p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Unfiled attachments */}
        {attachments.length > 0 ? (
          <div className="space-y-2 mt-2">
            {folders.length > 0 && (
              <p className="text-xs text-gray-400 mb-1">{t.folderUnfiled}</p>
            )}
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 bg-gray-50 rounded-md px-3 py-2 group"
              >
                <span className="text-lg">{getFileIcon(file.mimeType)}</span>
                <div className="flex-1 min-w-0">
                  <a
                    href={`/api/projects/${projectId}/attachments/${file.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block"
                  >
                    {file.originalName}
                  </a>
                  <div className="flex gap-3 text-xs text-gray-400">
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {isEditableInBrowser(file.mimeType) && (
                  <button
                    onClick={() => router.push(`/projects/${projectId}/editor/${file.id}`)}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded transition-opacity"
                  >
                    {t.edit}
                  </button>
                )}
                {folders.length > 0 && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) handleMoveToFolder(file.id, e.target.value, null)
                      e.target.value = ""
                    }}
                    defaultValue=""
                    className="opacity-0 group-hover:opacity-100 text-xs border border-gray-300 rounded px-1 py-0.5 transition-opacity"
                    title={t.folderMoveTo}
                  >
                    <option value="" disabled>{t.folderMoveTo}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                )}
                <a
                  href={`/api/projects/${projectId}/attachments/${file.id}/download`}
                  download
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity"
                  title={t.dashboardDownload}
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </a>
                <button
                  onClick={() => handleDeleteAttachment(file.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-opacity"
                >
                  {t.delete}
                </button>
              </div>
            ))}
          </div>
        ) : (
          folders.length === 0 && (
            <p className="text-sm text-gray-400">{t.dashboardNoAttachments}</p>
          )
        )}
      </div>

      {/* Overview counts */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold mb-4 text-gray-500 uppercase tracking-wider">
          {t.dashboardOverview}
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div
            onClick={() => router.push(`/projects/${projectId}/icebox`)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{pt.navIcebox}</div>
            <div className="text-3xl font-bold mt-2 text-gray-900">{iceboxCount}</div>
          </div>
          <div
            onClick={() => router.push(`/projects/${projectId}/backlog`)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{pt.navBacklog}</div>
            <div className="text-3xl font-bold mt-2 text-gray-900">{backlogCount}</div>
          </div>
          <div
            onClick={() => router.push(`/projects/${projectId}/sprints`)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{pt.navSprints}</div>
            <div className="text-3xl font-bold mt-2 text-gray-900">{sprintCount}</div>
          </div>
        </div>
      </div>

      {/* Active Sprint */}
      <div>
        <h2 className="text-xs font-semibold mb-4 text-gray-500 uppercase tracking-wider">
          {t.dashboardActiveSprint}
        </h2>
        {activeSprint ? (
          <div
            onClick={() => router.push(`/projects/${projectId}/sprints`)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
          >
            <h3 className="text-xl font-bold mb-3 text-gray-900">{activeSprint.name}</h3>
            {activeSprint.goal && (
              <p className="text-sm text-gray-600 mb-3">
                <span className="font-semibold text-gray-700">{t.dashboardGoal}:</span>{" "}
                {activeSprint.goal}
              </p>
            )}
            <div className="flex gap-6 text-sm text-gray-400 mb-5">
              <span>
                {t.dashboardPeriod}:{" "}
                {new Date(activeSprint.startDate).toLocaleDateString()} ~{" "}
                {new Date(activeSprint.endDate).toLocaleDateString()}
              </span>
              <span>
                {t.dashboardCapacity}: {activeSprint.capacity}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="text-xs font-medium text-slate-500">{t.taskTodo}</div>
                <div className="text-2xl font-bold text-slate-700 mt-1">
                  {activeSprint.taskCounts.todo}
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-xs font-medium text-blue-500">{t.taskInProgress}</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">
                  {activeSprint.taskCounts.inProgress}
                </div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <div className="text-xs font-medium text-emerald-500">{t.taskDone}</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {activeSprint.taskCounts.done}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            {t.dashboardNoActiveSprint}
          </p>
        )}
      </div>
    </div>
  )
}

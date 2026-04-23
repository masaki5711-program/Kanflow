"use client"

import { useState, useRef, useCallback, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import { useConfirm } from "@/components/confirm-dialog"
import { compressImageFile } from "@/lib/image-compress"
import MediaPreviewModal, { type MediaItem } from "@/components/media-preview-modal"

function isPreviewable(mime: string): boolean {
  return mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/")
}

interface ProductGoal { id: string; title: string; description: string | null }
interface Attachment { id: string; originalName: string; fileName: string; fileSize: number; mimeType: string; folderId: string | null; createdAt: string }
interface Folder { id: string; name: string; attachments: Attachment[] }

interface DashboardContentProps {
  projectId: string; projectName: string; projectDescription: string | null
  productGoals: ProductGoal[]; folders: Folder[]; attachments: Attachment[]
  iceboxCount: number; backlogCount: number; sprintCount: number
  projectProgressPct: number
  currentUserRole: string
  activeSprint: { name: string; goal: string | null; startDate: string; endDate: string; capacity: number; taskCounts: { todo: number; inProgress: number; done: number } } | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string): ReactNode {
  const cls = "w-5 h-5"
  if (mimeType.startsWith("image/")) return (
    <svg className={`${cls} text-pink-500`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M1 8a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 018.07 3h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0016.07 6H17a2 2 0 012 2v7a2 2 0 01-2 2H3a2 2 0 01-2-2V8zm13.5 3a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM10 14a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
  )
  if (mimeType === "application/pdf") return (
    <svg className={`${cls} text-red-500`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
  )
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return (
    <svg className={`${cls} text-emerald-500`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd"/></svg>
  )
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return (
    <svg className={`${cls} text-orange-500`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd"/></svg>
  )
  if (mimeType.includes("word") || mimeType.includes("document")) return (
    <svg className={`${cls} text-blue-500`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
  )
  return (
    <svg className={`${cls} text-gray-400`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
  )
}

function isEditableInBrowser(mimeType: string): boolean {
  return mimeType.includes("word") || mimeType.includes("document") || mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("presentation") || mimeType.includes("powerpoint")
}

/* Shared SVG Icons */
const IconDashboard = () => <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
const IconReport = () => <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4-1a1 1 0 10-2 0v7a1 1 0 102 0V8z" clipRule="evenodd"/></svg>
const IconBriefcase = () => <svg className="w-6 h-6 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm-3 8.57A24.97 24.97 0 0010 15c1.756 0 3.462-.183 5-.514V16a2 2 0 01-2 2H7a2 2 0 01-2-2v-3.43z" clipRule="evenodd"/></svg>
const IconPencil = () => <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
const IconTarget = () => <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-2a4 4 0 100-8 4 4 0 000 8zm0-2a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
const IconStar = () => <svg className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
const IconLightbulb = () => <svg className="w-6 h-6 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1zM10 17a1 1 0 001-1v-1a1 1 0 10-2 0v1a1 1 0 001 1zm3.536-2.05a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zm-8.486 1.414a1 1 0 101.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707z"/><path fillRule="evenodd" d="M10 5a5 5 0 100 10 5 5 0 000-10zm-3 5a3 3 0 116 0 3 3 0 01-6 0z" clipRule="evenodd"/></svg>
const IconClipboard = () => <svg className="w-6 h-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/></svg>
const IconBolt = () => <svg className="w-6 h-6 text-violet-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd"/></svg>
const IconRocket = () => <svg className="w-5 h-5 text-violet-500" viewBox="0 0 20 20" fill="currentColor"><path d="M9.293 1.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L11.586 7H5a1 1 0 010-2h6.586L9.293 2.707a1 1 0 010-1.414z"/><path d="M3 5a2 2 0 012-2h1a1 1 0 010 2H5v10h1a1 1 0 110 2H5a2 2 0 01-2-2V5z"/></svg>
const IconCalendar = () => <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
const IconGauge = () => <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
const IconCircle = () => <svg className="w-5 h-5 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="7"/></svg>
const IconArrowCircle = () => <svg className="w-5 h-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" style={{ transform: "rotate(90deg)", transformOrigin: "center" }}/></svg>
const IconCheckCircle = () => <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
const IconPaperclip = () => <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
const IconFolder = () => <svg className="w-5 h-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
const IconCloudUp = () => <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 0113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z"/><path d="M9 13h2v5a1 1 0 11-2 0v-5z"/></svg>
const IconDownload = () => <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
const IconX = () => <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
const IconPlus = () => <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>

/* Reusable file row */
function FileRow({ file, projectId, folderId, folders, onDelete, onMove, onEdit, onPreview, t }: {
  file: Attachment; projectId: string; folderId: string | null; folders: Folder[]
  onDelete: (id: string, folderId: string | null) => void
  onMove: (id: string, targetId: string | null, sourceId: string | null) => void
  onEdit: (id: string) => void
  onPreview: (id: string) => void
  t: Translations
}) {
  const otherFolders = folderId ? folders.filter((f) => f.id !== folderId) : folders
  const canMove = folderId ? true : otherFolders.length > 0
  const previewable = isPreviewable(file.mimeType)
  const fileUrl = `/api/projects/${projectId}/attachments/${file.id}`
  const downloadUrl = `${fileUrl}?download=1`
  return (
    <div className="flex items-center gap-3 bg-gray-50/80 rounded-lg px-3 py-2.5 group hover:bg-gray-100/80 transition-colors">
      <span className="shrink-0">{getFileIcon(file.mimeType)}</span>
      <div className="flex-1 min-w-0">
        {previewable ? (
          <button
            type="button"
            onClick={() => onPreview(file.id)}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block text-left w-full"
          >
            {file.originalName}
          </button>
        ) : (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block">{file.originalName}</a>
        )}
        <div className="flex gap-3 text-xs text-gray-400"><span>{formatFileSize(file.fileSize)}</span><span>{new Date(file.createdAt).toLocaleDateString()}</span></div>
      </div>
      {isEditableInBrowser(file.mimeType) && (
        <button onClick={() => onEdit(file.id)} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded transition-opacity">{t.edit}</button>
      )}
      {canMove && (
        <select onChange={(e) => { const v = e.target.value; if (v === "__unfiled__") onMove(file.id, null, folderId); else if (v) onMove(file.id, v, folderId); e.target.value = "" }} defaultValue="" className="opacity-0 group-hover:opacity-100 text-xs border border-gray-300 rounded px-1 py-0.5 transition-opacity" title={t.folderMoveTo}>
          <option value="" disabled>{t.folderMoveTo}</option>
          {folderId && <option value="__unfiled__">{t.folderUnfiled}</option>}
          {otherFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <a href={downloadUrl} download className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity" title={t.dashboardDownload}><IconDownload /></a>
      <button onClick={() => onDelete(file.id, folderId)} className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-opacity">{t.delete}</button>
    </div>
  )
}

export function DashboardContent({ projectId, projectName, projectDescription, productGoals: initialGoals, folders: initialFolders, attachments: initialAttachments, iceboxCount, backlogCount, sprintCount, projectProgressPct, currentUserRole, activeSprint }: DashboardContentProps) {
  const { t, pt } = useLanguage()
  const confirm = useConfirm()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState(projectDescription ?? "")
  const [editingDescription, setEditingDescription] = useState(false)
  const [descSaving, setDescSaving] = useState(false)
  const [goals, setGoals] = useState<ProductGoal[]>(initialGoals)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ title: "", description: "" })
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
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
  const [preview, setPreview] = useState<{ items: MediaItem[]; index: number } | null>(null)
  const [progress, setProgress] = useState<number>(projectProgressPct)
  const [editingProgress, setEditingProgress] = useState(false)
  const [progressDraft, setProgressDraft] = useState<string>(String(projectProgressPct))
  const [progressSaving, setProgressSaving] = useState(false)
  const canEditProgress = currentUserRole === "po"

  async function saveProgress() {
    const parsed = Math.max(0, Math.min(100, Math.round(Number(progressDraft))))
    if (Number.isNaN(parsed)) { setEditingProgress(false); return }
    setProgressSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressPct: parsed }),
      })
      if (res.ok) {
        setProgress(parsed)
        setEditingProgress(false)
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.error || t.error)
      }
    } finally {
      setProgressSaving(false)
    }
  }

  function openPreview(file: Attachment, folderId: string | null) {
    const sourceList = folderId
      ? folders.find((f) => f.id === folderId)?.attachments ?? []
      : attachments
    // Only media items participate in prev/next but we include the clicked
    // file even if it is audio/video so the modal has context.
    const mediaItems: MediaItem[] = sourceList
      .filter((a) => isPreviewable(a.mimeType))
      .map((a) => ({ id: a.id, originalName: a.originalName, mimeType: a.mimeType }))
    if (mediaItems.length === 0) return
    const idx = mediaItems.findIndex((m) => m.id === file.id)
    setPreview({ items: mediaItems, index: idx >= 0 ? idx : 0 })
  }

  const saveDescription = useCallback(async () => {
    setDescSaving(true)
    try {
      await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) })
      setEditingDescription(false)
    } finally { setDescSaving(false) }
  }, [projectId, description])

  async function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = editingGoalId ? `/api/projects/${projectId}/goals/${editingGoalId}` : `/api/projects/${projectId}/goals`
    const res = await fetch(url, { method: editingGoalId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(goalForm) })
    if (res.ok) {
      const saved = await res.json()
      if (editingGoalId) { setGoals(goals.map((g) => (g.id === editingGoalId ? saved : g))) } else { setGoals([...goals, saved]) }
      setGoalForm({ title: "", description: "" }); setShowGoalForm(false); setEditingGoalId(null)
    }
  }
  async function handleDeleteGoal(goalId: string) {
    if (!await confirm({ message: t.delete + "?", confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(`/api/projects/${projectId}/goals/${goalId}`, { method: "DELETE" })
    if (res.ok) setGoals(goals.filter((g) => g.id !== goalId))
  }
  function startEditGoal(goal: ProductGoal) { setEditingGoalId(goal.id); setGoalForm({ title: goal.title, description: goal.description ?? "" }); setShowGoalForm(true) }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, folderId?: string | null) {
    const rawFile = e.target.files?.[0]; if (!rawFile) return
    setUploading(true); setUploadingFolderId(folderId ?? null)
    try {
      // Client-side compression for images (longest edge 1920px, JPEG 0.82).
      // Videos / other types pass through unchanged.
      const file = rawFile.type.startsWith("image/")
        ? await compressImageFile(rawFile)
        : rawFile
      const formData = new FormData(); formData.append("file", file)
      if (folderId) formData.append("folderId", folderId)
      const res = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: formData })
      if (res.ok) {
        const saved = await res.json()
        if (folderId) { setFolders(folders.map((f) => f.id === folderId ? { ...f, attachments: [saved, ...f.attachments] } : f)) } else { setAttachments([saved, ...attachments]) }
      } else { const err = await res.json(); alert(err.error ?? t.error) }
    } finally {
      setUploading(false); setUploadingFolderId(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      const ref = folderId ? folderFileInputRefs.current[folderId] : null; if (ref) ref.value = ""
    }
  }
  async function handleDeleteAttachment(attachmentId: string, folderId?: string | null) {
    if (!await confirm({ message: t.dashboardDeleteAttachmentConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(`/api/projects/${projectId}/attachments/${attachmentId}`, { method: "DELETE" })
    if (res.ok) {
      if (folderId) { setFolders(folders.map((f) => f.id === folderId ? { ...f, attachments: f.attachments.filter((a) => a.id !== attachmentId) } : f)) } else { setAttachments(attachments.filter((a) => a.id !== attachmentId)) }
    }
  }
  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault(); if (!newFolderName.trim()) return
    const res = await fetch(`/api/projects/${projectId}/folders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFolderName.trim() }) })
    if (res.ok) { const folder = await res.json(); setFolders([...folders, folder]); setOpenFolders((prev) => new Set([...prev, folder.id])); setNewFolderName(""); setShowNewFolder(false) }
  }
  async function handleRenameFolder(folderId: string) {
    const trimmed = editFolderName.trim(); if (!trimmed) { setEditingFolderId(null); return }
    const res = await fetch(`/api/projects/${projectId}/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) })
    if (res.ok) { setFolders(folders.map((f) => f.id === folderId ? { ...f, name: trimmed } : f)); setEditingFolderId(null) }
  }
  async function handleDeleteFolder(folderId: string) {
    if (!await confirm({ message: t.folderDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const folder = folders.find((f) => f.id === folderId)
    const res = await fetch(`/api/projects/${projectId}/folders/${folderId}`, { method: "DELETE" })
    if (res.ok) { if (folder) { setAttachments([...folder.attachments.map((a) => ({ ...a, folderId: null })), ...attachments]) } setFolders(folders.filter((f) => f.id !== folderId)) }
  }
  function toggleFolder(folderId: string) { const next = new Set(openFolders); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); setOpenFolders(next) }
  async function handleMoveToFolder(attachmentId: string, targetFolderId: string | null, sourceFolderId: string | null) {
    const res = await fetch(`/api/projects/${projectId}/attachments/${attachmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: targetFolderId }) })
    if (res.ok) {
      let movedFile: Attachment | undefined
      if (sourceFolderId) { movedFile = folders.find((f) => f.id === sourceFolderId)?.attachments.find((a) => a.id === attachmentId); setFolders(folders.map((f) => f.id === sourceFolderId ? { ...f, attachments: f.attachments.filter((a) => a.id !== attachmentId) } : f)) } else { movedFile = attachments.find((a) => a.id === attachmentId); setAttachments(attachments.filter((a) => a.id !== attachmentId)) }
      if (movedFile && targetFolderId) { const updated = { ...movedFile, folderId: targetFolderId }; setFolders((prev) => prev.map((f) => f.id === targetFolderId ? { ...f, attachments: [updated, ...f.attachments] } : f)) }
      else if (movedFile && !targetFolderId) { setAttachments((prev) => [{ ...movedFile!, folderId: null }, ...prev]) }
    }
  }

  const totalTasks = activeSprint ? activeSprint.taskCounts.todo + activeSprint.taskCounts.inProgress + activeSprint.taskCounts.done : 0
  const donePercent = totalTasks > 0 && activeSprint ? Math.min(100, Math.round((activeSprint.taskCounts.done / totalTasks) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20"><IconDashboard /></div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.dashboardTitle}</h1>
        </div>
        <a href={`/projects/${projectId}/report`} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg hover:from-gray-800 hover:to-gray-900 text-sm font-medium shadow-sm transition-all hover:shadow-md">
          <IconReport />{t.reportTitle}
        </a>
      </div>

      {/* Project Info Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500" />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <IconBriefcase />
            <h2 className="text-2xl font-bold text-gray-900">{projectName}</h2>
          </div>
          <div className="mb-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm font-semibold text-emerald-800">{t.projectProgress}</span>
                {!canEditProgress && (
                  <span className="text-xs text-emerald-600">(PO が設定)</span>
                )}
              </div>
              {editingProgress && canEditProgress ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={progressDraft}
                    onChange={(e) => setProgressDraft(e.target.value)}
                    className="w-40 accent-emerald-600"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={progressDraft}
                    onChange={(e) => setProgressDraft(e.target.value)}
                    className="w-16 px-2 py-1 text-sm border border-emerald-200 rounded-md text-emerald-700 font-semibold text-right"
                  />
                  <span className="text-sm text-emerald-700 font-semibold">%</span>
                  <button
                    onClick={saveProgress}
                    disabled={progressSaving}
                    className="px-3 py-1 bg-emerald-600 text-white rounded-md text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {progressSaving ? t.saving : t.save}
                  </button>
                  <button
                    onClick={() => { setProgressDraft(String(progress)); setEditingProgress(false) }}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => canEditProgress && setEditingProgress(true)}
                  disabled={!canEditProgress}
                  className={`text-2xl font-bold text-emerald-700 ${canEditProgress ? "hover:bg-emerald-100 cursor-pointer" : "cursor-default"} px-2 py-0.5 rounded-md transition-colors`}
                  title={canEditProgress ? "クリックして編集" : ""}
                >
                  {Math.min(100, Math.max(0, progress))}<span className="text-sm">%</span>
                </button>
              )}
            </div>
            <div className="w-full bg-white/70 rounded-full h-2.5 overflow-hidden ring-1 ring-emerald-100">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, editingProgress ? Number(progressDraft) || 0 : progress))}%` }}
              />
            </div>
          </div>
          {/* Description */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-500">{t.dashboardDescription}</label>
              {!editingDescription && (
                <button
                  onClick={() => setEditingDescription(true)}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                  title={t.edit}
                >
                  <IconPencil />
                  <span>{t.edit}</span>
                </button>
              )}
            </div>
            {editingDescription ? (
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={10}
                  placeholder={t.dashboardDescriptionPlaceholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[200px]"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveDescription} disabled={descSaving} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 transition-colors">{descSaving ? t.saving : t.save}</button>
                  <button onClick={() => { setDescription(projectDescription ?? ""); setEditingDescription(false) }} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors">{t.cancel}</button>
                </div>
              </div>
            ) : (
              <div className="min-h-[160px] max-h-[480px] overflow-y-auto px-4 py-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {description || <span className="text-gray-400">{t.dashboardDescriptionPlaceholder}</span>}
              </div>
            )}
          </div>
          {/* Product Goals */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><IconTarget /><span className="text-sm font-semibold text-gray-700">{t.dashboardProductGoals}</span></div>
              <button onClick={() => { setGoalForm({ title: "", description: "" }); setEditingGoalId(null); setShowGoalForm(!showGoalForm) }} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors">{t.dashboardAddGoal}</button>
            </div>
            {showGoalForm && (
              <form onSubmit={handleGoalSubmit} className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 mb-3 space-y-2">
                <input type="text" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} required placeholder={t.dashboardProductGoals} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                <textarea value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} rows={2} placeholder={t.dashboardDescription} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors">{editingGoalId ? t.update : t.add}</button>
                  <button type="button" onClick={() => { setShowGoalForm(false); setEditingGoalId(null) }} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors">{t.cancel}</button>
                </div>
              </form>
            )}
            {goals.length > 0 ? (
              <div className="space-y-2">
                {goals.map((goal) => (
                  <div key={goal.id} className="flex items-start gap-2.5 bg-gray-50/80 rounded-lg p-3 group hover:bg-gray-100/80 transition-colors">
                    <IconStar />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{goal.title}</p>
                      {goal.description && <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity shrink-0">
                      <button onClick={() => startEditGoal(goal)} className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">{t.edit}</button>
                      <button onClick={() => handleDeleteGoal(goal.id)} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors">{t.delete}</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400">{t.dashboardNoGoals}</p>}
          </div>
        </div>
      </div>

      {/* Overview Count Cards */}
      <div>
        <h2 className="text-xs font-semibold mb-4 text-gray-500 uppercase tracking-wider">{t.dashboardOverview}</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: pt.navIcebox, count: iceboxCount, path: "icebox", icon: <IconLightbulb />, bg: "bg-amber-50", border: "border-b-amber-400", ring: "bg-amber-100" },
            { label: pt.navBacklog, count: backlogCount, path: "backlog", icon: <IconClipboard />, bg: "bg-blue-50", border: "border-b-blue-400", ring: "bg-blue-100" },
            { label: pt.navSprints, count: sprintCount, path: "sprints", icon: <IconBolt />, bg: "bg-violet-50", border: "border-b-violet-400", ring: "bg-violet-100" },
          ].map((card) => (
            <div key={card.path} onClick={() => router.push(`/projects/${projectId}/${card.path}`)} className={`bg-white rounded-2xl border border-gray-100 border-b-[3px] ${card.border} shadow-sm p-5 hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`${card.ring} p-2.5 rounded-full`}>{card.icon}</div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{card.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Sprint */}
      <div>
        <h2 className="text-xs font-semibold mb-4 text-gray-500 uppercase tracking-wider">{t.dashboardActiveSprint}</h2>
        {activeSprint ? (
          <div onClick={() => router.push(`/projects/${projectId}/sprints`)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-gray-200 transition-all">
            <div className="h-[3px] bg-gradient-to-r from-violet-500 to-purple-500" />
            <div className="p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <IconRocket />
                <h3 className="text-xl font-bold text-gray-900">{activeSprint.name}</h3>
              </div>
              {activeSprint.goal && (
                <div className="border-l-[3px] border-violet-300 bg-violet-50/50 rounded-r-lg px-4 py-2.5 mb-4">
                  <p className="text-sm text-gray-700 italic">{activeSprint.goal}</p>
                </div>
              )}
              <div className="flex gap-6 text-sm text-gray-500 mb-5">
                <span className="inline-flex items-center gap-1.5"><IconCalendar />{new Date(activeSprint.startDate).toLocaleDateString()} ~ {new Date(activeSprint.endDate).toLocaleDateString()}</span>
                <span className="inline-flex items-center gap-1.5"><IconGauge />{t.dashboardCapacity}: {activeSprint.capacity}</span>
              </div>
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>{t.taskDone}: {activeSprint.taskCounts.done}/{totalTasks}</span>
                  <span className="font-semibold text-emerald-600">{donePercent}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${donePercent}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-4 text-center">
                  <div className="flex justify-center mb-1.5"><IconCircle /></div>
                  <div className="text-xs font-medium text-slate-500">{t.taskTodo}</div>
                  <div className="text-2xl font-bold text-slate-700 mt-0.5">{activeSprint.taskCounts.todo}</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="flex justify-center mb-1.5"><IconArrowCircle /></div>
                  <div className="text-xs font-medium text-blue-500">{t.taskInProgress}</div>
                  <div className="text-2xl font-bold text-blue-700 mt-0.5">{activeSprint.taskCounts.inProgress}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <div className="flex justify-center mb-1.5"><IconCheckCircle /></div>
                  <div className="text-xs font-medium text-emerald-500">{t.taskDone}</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-0.5">{activeSprint.taskCounts.done}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">{t.dashboardNoActiveSprint}</p>
        )}
      </div>

      {/* Attachments */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><IconPaperclip /><h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t.dashboardAttachments}</h2></div>
          <div className="flex gap-2">
            <button onClick={() => setShowNewFolder(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-200 font-medium transition-colors"><IconFolder />{t.folderNew}</button>
            <input ref={fileInputRef} type="file" onChange={(e) => handleFileUpload(e)} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,video/*,audio/*" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading && !uploadingFolderId} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"><IconCloudUp />{uploading && !uploadingFolderId ? t.loading : t.dashboardUploadFile}</button>
          </div>
        </div>
        {showNewFolder && (
          <form onSubmit={handleCreateFolder} className="flex gap-2 mb-4">
            <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder={t.folderName} autoFocus className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <button type="submit" className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">{t.create}</button>
            <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName("") }} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">{t.cancel}</button>
          </form>
        )}
        {/* Folders */}
        {folders.map((folder) => (
          <div key={folder.id} className="mb-3 border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 group/folder">
              <button onClick={() => toggleFolder(folder.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className={`w-4 h-4 transition-transform ${openFolders.has(folder.id) ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
              </button>
              <IconFolder />
              {editingFolderId === folder.id ? (
                <input type="text" value={editFolderName} onChange={(e) => setEditFolderName(e.target.value)} onBlur={() => handleRenameFolder(folder.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") setEditingFolderId(null) }} autoFocus className="flex-1 px-2 py-0.5 text-sm border border-blue-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
              ) : (
                <span className="flex-1 text-sm font-medium text-gray-700 cursor-pointer" onClick={() => toggleFolder(folder.id)}>{folder.name}<span className="text-xs text-gray-400 ml-2">({folder.attachments.length})</span></span>
              )}
              <div className="opacity-0 group-hover/folder:opacity-100 flex items-center gap-1 transition-opacity">
                <input ref={(el) => { folderFileInputRefs.current[folder.id] = el }} type="file" onChange={(e) => handleFileUpload(e, folder.id)} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,video/*,audio/*" />
                <button onClick={() => folderFileInputRefs.current[folder.id]?.click()} disabled={uploading && uploadingFolderId === folder.id} className="p-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors" title={t.dashboardUploadFile}>
                  {uploading && uploadingFolderId === folder.id ? <span className="w-4 h-4 block text-xs leading-4 text-center">...</span> : <IconPlus />}
                </button>
                <button onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title={t.folderEditName}><IconPencil /></button>
                <button onClick={() => handleDeleteFolder(folder.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title={t.folderDeleteTitle}><IconX /></button>
              </div>
            </div>
            {openFolders.has(folder.id) && (
              <div className="px-3 py-2 space-y-1">
                {folder.attachments.length > 0 ? folder.attachments.map((file) => (
                  <FileRow key={file.id} file={file} projectId={projectId} folderId={folder.id} folders={folders} onDelete={handleDeleteAttachment} onMove={handleMoveToFolder} onEdit={(id) => router.push(`/projects/${projectId}/editor/${id}`)} onPreview={() => openPreview(file, folder.id)} t={t} />
                )) : <p className="text-xs text-gray-400 py-2">{t.folderNoFiles}</p>}
              </div>
            )}
          </div>
        ))}
        {/* Unfiled attachments */}
        {attachments.length > 0 ? (
          <div className="space-y-1 mt-2">
            {folders.length > 0 && <p className="text-xs text-gray-400 mb-1">{t.folderUnfiled}</p>}
            {attachments.map((file) => (
              <FileRow key={file.id} file={file} projectId={projectId} folderId={null} folders={folders} onDelete={handleDeleteAttachment} onMove={handleMoveToFolder} onEdit={(id) => router.push(`/projects/${projectId}/editor/${id}`)} onPreview={() => openPreview(file, null)} t={t} />
            ))}
          </div>
        ) : folders.length === 0 && <p className="text-sm text-gray-400">{t.dashboardNoAttachments}</p>}
      </div>

      {preview && (
        <MediaPreviewModal
          projectId={projectId}
          items={preview.items}
          startIndex={preview.index}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

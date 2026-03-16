"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"

interface IceboxAttachment {
  id: string
  fileName: string
  originalName: string
  fileSize: number
  mimeType: string
}

interface IceboxItem {
  id: string
  displayId: number
  author: string
  request: string
  background: string | null
  status: string
  assignedPo: string | null
  poHearingMemo: string | null
  poReviewMemo: string | null
  rejectionReason: string | null
  freezeReason: string | null
  createdAt: string
  attachments: IceboxAttachment[]
}

/* ── SVG Icon helper ── */
function Ico({ d, className, clip, children }: { d?: string; className?: string; clip?: boolean; children?: React.ReactNode }) {
  return (
    <svg className={className ?? "w-4 h-4"} viewBox="0 0 20 20" fill="currentColor">
      {children ?? (clip ? <path fillRule="evenodd" d={d} clipRule="evenodd" /> : <path d={d} />)}
    </svg>
  )
}
const P = { // SVG path data for each icon
  inbox: "M2.5 4A1.5 1.5 0 001 5.5V6h18v-.5A1.5 1.5 0 0017.5 4h-15zM19 8H1v6.5A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5V8zm-8 2a1 1 0 00-1 1v.5H7.5a.5.5 0 00-.5.5v1a2.5 2.5 0 005 0v-1a.5.5 0 00-.5-.5H11V11a1 1 0 00-1-1z",
  plus: "M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z",
  search: "M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z",
  clock: "M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z",
  check: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
  snow: "M10 2a.75.75 0 01.75.75v2.19l1.72-1.72a.75.75 0 111.06 1.06L11.81 6H10.75v-1.06l1.72-1.72a.75.75 0 00-1.06-1.06L10 3.53 8.59 2.16a.75.75 0 00-1.06 1.06L9.25 4.94V6H8.19L6.47 4.28a.75.75 0 00-1.06 1.06L7.13 7H4.75a.75.75 0 000 1.5H7.5l2 2-2 2H4.75a.75.75 0 000 1.5h2.38l-1.72 1.72a.75.75 0 101.06 1.06L8.19 15H9.25v1.06l-1.72 1.72a.75.75 0 101.06 1.06L10 17.47l1.41 1.41a.75.75 0 101.06-1.06l-1.72-1.72V15h1.06l1.72 1.72a.75.75 0 101.06-1.06L12.87 14h2.38a.75.75 0 000-1.5H12.5l-2-2 2-2h2.75a.75.75 0 000-1.5h-2.38l1.72-1.72a.75.75 0 00-1.06-1.06L11.81 6h-1.06V4.94l1.72-1.72a.75.75 0 00-1.06-1.06L10 3.53V2.75A.75.75 0 0010 2z",
  person: "M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z",
  clip: "M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z",
  doc: "M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z",
  info: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z",
  tag: "M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z",
  chat: "M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z",
  upload: "M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2.75a.75.75 0 001.5 0V9.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0l-3.25 3.5a.75.75 0 101.1 1.02l1.95-2.1v4.59z",
  pencil: "M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z",
  trash: "M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z",
  file: "M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l4.122 4.12A1.5 1.5 0 0117 7.622V16.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13z",
  arrow: "M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z",
  download: "M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z",
  x: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z",
  eye: "M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  eyeClip: "M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z",
}
// Icons that use evenodd clip-rule
const clipIcons = new Set(["search","clock","check","clip","doc","info","tag","chat","upload","trash","arrow","download","x"])

/* ── Section theme config ── */
const sectionTheme: Record<string, {
  border: string; iconBg: string; iconText: string; badgeBg: string; badgeText: string; accent: string
}> = {
  unreviewed: { border: "border-l-amber-400", iconBg: "bg-amber-50", iconText: "text-amber-600", badgeBg: "bg-amber-100", badgeText: "text-amber-700", accent: "border-l-amber-300" },
  reviewed: { border: "border-l-emerald-400", iconBg: "bg-emerald-50", iconText: "text-emerald-600", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", accent: "border-l-emerald-300" },
  frozen: { border: "border-l-slate-400", iconBg: "bg-slate-100", iconText: "text-slate-500", badgeBg: "bg-slate-200", badgeText: "text-slate-600", accent: "border-l-slate-300" },
}
function I(name: keyof typeof P, cls?: string) {
  return <Ico d={P[name]} className={cls} clip={clipIcons.has(name)} />
}
const sectionIcons: Record<string, React.ReactNode> = {
  unreviewed: I("clock", "w-5 h-5"), reviewed: I("check", "w-5 h-5"), frozen: I("snow", "w-5 h-5"),
}
const statusBadgeIcon: Record<string, React.ReactNode> = {
  unreviewed: I("clock", "w-3 h-3"), reviewed: I("check", "w-3 h-3"), frozen: I("snow", "w-3 h-3"),
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function IceboxPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt } = useLanguage()
  const confirm = useConfirm()

  const statusLabels: Record<string, string> = {
    unreviewed: t.iceboxStatusUnreviewed,
    reviewed: t.iceboxStatusReviewed,
    frozen: t.iceboxStatusFrozen,
  }

  const [items, setItems] = useState<{
    unreviewed: IceboxItem[]
    reviewed: IceboxItem[]
    frozen: IceboxItem[]
  }>({ unreviewed: [], reviewed: [], frozen: [] })

  const [showForm, setShowForm] = useState(false)
  const [author, setAuthor] = useState("")
  const [request, setRequest] = useState("")
  const [background, setBackground] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const [editingItem, setEditingItem] = useState<IceboxItem | null>(null)
  const [editForm, setEditForm] = useState({
    author: "",
    request: "",
    background: "",
    status: "unreviewed",
    poHearingMemo: "",
    poReviewMemo: "",
    freezeReason: "",
  })
  const [editAttachments, setEditAttachments] = useState<IceboxAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)

  const totalCount = items.unreviewed.length + items.reviewed.length + items.frozen.length

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/icebox`)
      if (res.ok) setItems(await res.json())
    } finally {
      setInitialLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/icebox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, background: background || undefined, author: author || undefined }),
      })
      if (res.ok) {
        setShowForm(false)
        setAuthor("")
        setRequest("")
        setBackground("")
        fetchItems()
      }
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(itemId: string, newStatus: string) {
    const res = await fetch(`/api/projects/${projectId}/icebox/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) fetchItems()
  }

  function openEdit(item: IceboxItem) {
    setEditingItem(item)
    setEditForm({
      author: item.author,
      request: item.request,
      background: item.background ?? "",
      status: item.status,
      poHearingMemo: item.poHearingMemo ?? "",
      poReviewMemo: item.poReviewMemo ?? "",
      freezeReason: item.freezeReason ?? "",
    })
    setEditAttachments(item.attachments ?? [])
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingItem) return
    const res = await fetch(`/api/projects/${projectId}/icebox/${editingItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: editForm.author || undefined,
        request: editForm.request,
        background: editForm.background || null,
        status: editForm.status,
        poHearingMemo: editForm.poHearingMemo || null,
        poReviewMemo: editForm.poReviewMemo || null,
        freezeReason: editForm.freezeReason || null,
      }),
    })
    if (res.ok) {
      setEditingItem(null)
      fetchItems()
    } else {
      const err = await res.json().catch(() => null)
      alert(`${t.error}: ${err?.error || res.statusText}`)
    }
  }

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingItem) return
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(
        `/api/projects/${projectId}/icebox/${editingItem.id}/attachments`,
        { method: "POST", body: formData }
      )
      if (res.ok) {
        const saved = await res.json()
        setEditAttachments((prev) => [...prev, saved])
        fetchItems()
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.error || t.error)
      }
    } finally {
      setUploading(false)
      if (editFileInputRef.current) editFileInputRef.current.value = ""
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!editingItem) return
    const res = await fetch(
      `/api/projects/${projectId}/icebox/${editingItem.id}/attachments/${attachmentId}`,
      { method: "DELETE" }
    )
    if (res.ok) {
      setEditAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
      fetchItems()
    }
  }

  async function handleDelete(itemId: string) {
    if (!await confirm({ message: t.iceboxDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(`/api/projects/${projectId}/icebox/${itemId}`, { method: "DELETE" })
    if (res.ok) fetchItems()
  }

  function getAttachmentUrl(itemId: string, attachmentId: string): string {
    return `/api/projects/${projectId}/icebox/${itemId}/attachments/${attachmentId}`
  }

  function getMoveTargets(currentStatus: string): { status: string; label: string; color: string }[] {
    const targets: { status: string; label: string; color: string }[] = []
    if (currentStatus !== "reviewed") {
      targets.push({ status: "reviewed", label: t.iceboxMoveToReviewed, color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" })
    }
    if (currentStatus !== "frozen") {
      targets.push({ status: "frozen", label: t.iceboxMoveToFrozen, color: "text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100" })
    }
    if (currentStatus !== "unreviewed") {
      targets.push({ status: "unreviewed", label: t.iceboxMoveToUnreviewed, color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" })
    }
    return targets
  }

  function renderSection(title: string, status: string, sectionItems: IceboxItem[]) {
    const theme = sectionTheme[status]
    const icon = sectionIcons[status]
    return (
      <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${theme.border} shadow-sm overflow-hidden`}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
          <div className={`p-1.5 rounded-lg ${theme.iconBg} ${theme.iconText}`}>{icon}</div>
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
            {sectionItems.length}{t.iceboxCount}
          </span>
        </div>
        <div className="divide-y divide-gray-100">
          {sectionItems.map((item) => {
            const moveTargets = getMoveTargets(item.status)
            const imageAttachments = (item.attachments ?? []).filter((a) => isImageType(a.mimeType))
            const otherAttachments = (item.attachments ?? []).filter((a) => !isImageType(a.mimeType))
            return (
              <div key={item.id} className={`px-5 py-4 border-l-2 ${theme.accent} hover:bg-gray-50/50 transition-colors`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[11px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        #{item.displayId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        {I("person", "w-3 h-3")}
                        {item.author}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                        {statusBadgeIcon[item.status]}
                        {statusLabels[item.status]}
                      </span>
                      {(item.attachments?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
                          {I("clip", "w-3 h-3")}
                          {item.attachments.length}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                      {item.request}
                    </p>
                    {item.background && (
                      <div className="mt-2 pl-3 border-l-2 border-gray-200">
                        <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap flex items-start gap-1.5">
                          {I("info", "w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400")}
                          <span>{item.background}</span>
                        </p>
                      </div>
                    )}
                    {imageAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {imageAttachments.map((att) => (
                          <button
                            key={att.id}
                            onClick={() => setPreviewImage({ url: getAttachmentUrl(item.id, att.id), name: att.originalName })}
                            className="relative group/img rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 shadow-sm hover:shadow transition-all"
                          >
                            <img src={getAttachmentUrl(item.id, att.id)} alt={att.originalName} className="w-24 h-24 object-cover" loading="lazy" width={96} height={96} />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                              <Ico className="w-5 h-5 text-white opacity-0 group-hover/img:opacity-100 drop-shadow-md transition-opacity"><path d={P.eye} /><path fillRule="evenodd" d={P.eyeClip} clipRule="evenodd" /></Ico>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {otherAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {otherAttachments.map((att) => (
                          <a
                            key={att.id}
                            href={getAttachmentUrl(item.id, att.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-gray-50 text-gray-600 rounded-lg border border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                            title={`${att.originalName} (${formatFileSize(att.fileSize)})`}
                          >
                            {I("file", "w-3 h-3")}
                            {att.originalName.length > 20 ? att.originalName.slice(0, 18) + "..." : att.originalName}
                          </a>
                        ))}
                      </div>
                    )}
                    {item.poHearingMemo && (
                      <div className="mt-2 pl-3 border-l-2 border-blue-200">
                        <p className="text-xs text-blue-600 leading-relaxed flex items-start gap-1.5">
                          {I("chat", "w-3.5 h-3.5 flex-shrink-0 mt-0.5")}
                          <span>{t.iceboxPoHearingMemo}: {item.poHearingMemo}</span>
                        </p>
                      </div>
                    )}
                    {item.poReviewMemo && (
                      <div className="mt-2 pl-3 border-l-2 border-emerald-200">
                        <p className="text-xs text-emerald-600 leading-relaxed flex items-start gap-1.5">
                          {I("check", "w-3.5 h-3.5 flex-shrink-0 mt-0.5")}
                          <span>{t.iceboxPoReviewMemo}: {item.poReviewMemo}</span>
                        </p>
                      </div>
                    )}
                    {item.freezeReason && (
                      <div className="mt-2 pl-3 border-l-2 border-slate-200">
                        <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-1.5">
                          {I("snow", "w-3.5 h-3.5 flex-shrink-0 mt-0.5")}
                          <span>{t.iceboxFreezeReason}: {item.freezeReason}</span>
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {moveTargets.map((target) => (
                      <button
                        key={target.status}
                        onClick={() => changeStatus(item.id, target.status)}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${target.color}`}
                      >
                        {I("arrow", "w-3 h-3")}
                        {target.label}
                      </button>
                    ))}
                    <div className="flex gap-1 mt-1 justify-end">
                      <button
                        onClick={() => openEdit(item)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                      >
                        {I("pencil", "w-3 h-3")}
                        {t.edit}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md transition-colors"
                      >
                        {I("trash", "w-3 h-3")}
                        {t.delete}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {sectionItems.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">{t.iceboxNoItems}</p>
          )}
        </div>
      </div>
    )
  }

  function renderEditModal() {
    if (!editingItem) return null
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditingItem(null)}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-5">
            {I("pencil", "w-5 h-5 text-blue-600")}
            <h3 className="text-lg font-semibold text-gray-900">{t.iceboxEditTitle}</h3>
            <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">#{editingItem.displayId}</span>
          </div>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {I("person", "w-4 h-4 text-gray-400")}
                {t.sprintAssignee}
              </label>
              <input
                type="text"
                value={editForm.author}
                onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {I("doc", "w-4 h-4 text-gray-400")}
                {pt.iceboxRequest}
              </label>
              <textarea
                value={editForm.request}
                onChange={(e) => setEditForm({ ...editForm, request: e.target.value })}
                required
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {I("info", "w-4 h-4 text-gray-400")}
                {pt.iceboxBackground}
              </label>
              <textarea
                value={editForm.background}
                onChange={(e) => setEditForm({ ...editForm, background: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                {I("clip", "w-4 h-4 text-gray-400")}
                {t.dashboardAttachments}
              </label>
              {editAttachments.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {editAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      {isImageType(att.mimeType) ? (
                        <img
                          src={getAttachmentUrl(editingItem.id, att.id)}
                          alt={att.originalName}
                          className="w-10 h-10 object-cover rounded-md"
                          width={40}
                          height={40}
                        />
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center bg-gray-200 rounded-md">
                          {I("file", "w-5 h-5 text-gray-500")}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate font-medium">{att.originalName}</p>
                        <p className="text-[10px] text-gray-400">{formatFileSize(att.fileSize)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        {I("trash", "w-3.5 h-3.5")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={editFileInputRef}
                type="file"
                onChange={handleUploadAttachment}
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
              />
              <button
                type="button"
                onClick={() => editFileInputRef.current?.click()}
                disabled={uploading || editAttachments.length >= 10}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {I("upload", "w-5 h-5")}
                {uploading ? t.loading : t.dashboardUploadFile}
              </button>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                PNG, JPEG, GIF, WebP, PDF, TXT (max 5MB, {editAttachments.length}/10)
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {I("tag", "w-4 h-4 text-gray-400")}
                {t.iceboxStatus}
              </label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="unreviewed">{t.iceboxStatusUnreviewed}</option>
                <option value="reviewed">{t.iceboxStatusReviewed}</option>
                <option value="frozen">{t.iceboxStatusFrozen}</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {I("chat", "w-4 h-4 text-gray-400")}
                {t.iceboxPoHearingMemo}
              </label>
              <textarea
                value={editForm.poHearingMemo}
                onChange={(e) => setEditForm({ ...editForm, poHearingMemo: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                {I("chat", "w-4 h-4 text-gray-400")}
                {t.iceboxPoReviewMemo}
              </label>
              <textarea
                value={editForm.poReviewMemo}
                onChange={(e) => setEditForm({ ...editForm, poReviewMemo: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
              />
            </div>
            {editForm.status === "frozen" && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  {I("snow", "w-4 h-4 text-gray-400")}
                  {t.iceboxFreezeReason}
                </label>
                <textarea
                  value={editForm.freezeReason}
                  onChange={(e) => setEditForm({ ...editForm, freezeReason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors">
                {t.update}
              </button>
              <button type="button" onClick={() => setEditingItem(null)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  function renderImagePreview() {
    if (!previewImage) return null
    return (
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] cursor-pointer"
        onClick={() => setPreviewImage(null)}
      >
        <div className="max-w-[90vw] max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
          />
          <div className="absolute top-3 right-3 flex gap-2">
            <a
              href={previewImage.url}
              download
              className="p-2 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
              title={t.dashboardDownload}
              onClick={(e) => e.stopPropagation()}
            >
              {I("download", "w-4 h-4 text-gray-700")}
            </a>
            <button
              onClick={() => setPreviewImage(null)}
              className="p-2 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
            >
              {I("x", "w-4 h-4 text-gray-700")}
            </button>
          </div>
          <div className="mt-3 text-center">
            <span className="inline-block bg-black/50 text-white/90 text-sm px-4 py-1.5 rounded-full">
              {previewImage.name}
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (initialLoading) {
    return (
      <div className="text-center py-16 text-gray-500">{t.loading}</div>
    )
  }

  return (
    <div>
      {renderEditModal()}
      {renderImagePreview()}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-xl">
            {I("inbox", "w-6 h-6 text-blue-600")}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{pt.iceboxTitle}</h1>
          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
            {totalCount}
          </span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-medium shadow-sm transition-all"
        >
          {I("plus", "w-4 h-4")}
          {t.iceboxAddRequest}
        </button>
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          {I("search", "w-4 h-4 text-gray-400")}
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`${pt.iceboxRequest} / ${pt.iceboxBackground}`}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:shadow-sm placeholder:text-gray-400 transition-all"
        />
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-500" />
          <div className="p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
              {I("plus", "w-5 h-5 text-blue-600")}
              {t.iceboxNewRequest}
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  {I("person", "w-4 h-4 text-gray-400")}
                  {t.sprintAssignee}
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder={t.sprintAssignee}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">{t.sprintNotEntered}</p>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  {I("doc", "w-4 h-4 text-gray-400")}
                  {pt.iceboxRequest}
                </label>
                <textarea
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  {I("info", "w-4 h-4 text-gray-400")}
                  {pt.iceboxBackground}
                </label>
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium shadow-sm transition-colors"
                >
                  {I("plus", "w-4 h-4")}
                  {t.add}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {(() => {
          const q = searchQuery.toLowerCase().trim()
          const filterItems = (list: IceboxItem[]) =>
            q
              ? list.filter(
                  (item) =>
                    item.request.toLowerCase().includes(q) ||
                    (item.background ?? "").toLowerCase().includes(q) ||
                    item.author.toLowerCase().includes(q) ||
                    (item.poHearingMemo ?? "").toLowerCase().includes(q) ||
                    (item.poReviewMemo ?? "").toLowerCase().includes(q) ||
                    String(item.displayId).includes(q)
                )
              : list
          return (
            <>
              {renderSection(t.iceboxStatusUnreviewed, "unreviewed", filterItems(items.unreviewed))}
              {renderSection(t.iceboxStatusReviewed, "reviewed", filterItems(items.reviewed))}
              {renderSection(t.iceboxStatusFrozen, "frozen", filterItems(items.frozen))}
            </>
          )
        })()}
      </div>
    </div>
  )
}

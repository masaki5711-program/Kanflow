"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"

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

const statusColors: Record<string, string> = {
  unreviewed: "bg-yellow-50 border-yellow-200",
  reviewed: "bg-green-50 border-green-200",
  frozen: "bg-gray-50 border-gray-300",
}

const statusBadge: Record<string, string> = {
  unreviewed: "bg-yellow-100 text-yellow-800",
  reviewed: "bg-green-100 text-green-800",
  frozen: "bg-gray-200 text-gray-600",
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

  // Edit modal
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

  // Image preview modal
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)

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
    if (!confirm(t.iceboxDeleteConfirm)) return
    const res = await fetch(`/api/projects/${projectId}/icebox/${itemId}`, {
      method: "DELETE",
    })
    if (res.ok) fetchItems()
  }

  function getAttachmentUrl(itemId: string, attachmentId: string): string {
    return `/api/projects/${projectId}/icebox/${itemId}/attachments/${attachmentId}`
  }

  // Status move targets
  function getMoveTargets(currentStatus: string): { status: string; label: string; color: string }[] {
    const targets: { status: string; label: string; color: string }[] = []
    if (currentStatus !== "reviewed") {
      targets.push({ status: "reviewed", label: t.iceboxMoveToReviewed, color: "text-green-700 bg-green-50 border-green-300 hover:bg-green-100" })
    }
    if (currentStatus !== "frozen") {
      targets.push({ status: "frozen", label: t.iceboxMoveToFrozen, color: "text-gray-600 bg-gray-50 border-gray-300 hover:bg-gray-100" })
    }
    if (currentStatus !== "unreviewed") {
      targets.push({ status: "unreviewed", label: t.iceboxMoveToUnreviewed, color: "text-yellow-700 bg-yellow-50 border-yellow-300 hover:bg-yellow-100" })
    }
    return targets
  }

  function renderSection(title: string, status: string, sectionItems: IceboxItem[]) {
    return (
      <div className={`rounded-lg border p-4 ${statusColors[status]}`}>
        <h2 className="text-lg font-semibold mb-3">
          {title}
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({sectionItems.length}{t.iceboxCount})
          </span>
        </h2>
        <div className="space-y-2">
          {sectionItems.map((item) => {
            const moveTargets = getMoveTargets(item.status)
            const imageAttachments = (item.attachments ?? []).filter((a) => isImageType(a.mimeType))
            const otherAttachments = (item.attachments ?? []).filter((a) => !isImageType(a.mimeType))

            return (
              <div
                key={item.id}
                className="bg-white rounded-md border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">
                        #{item.displayId}
                      </span>
                      <span className="text-xs text-gray-500">
                        {item.author}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge[item.status]}`}>
                        {statusLabels[item.status]}
                      </span>
                      {(item.attachments?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd"/>
                          </svg>
                          {item.attachments.length}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">
                      {item.request}
                    </p>
                    {item.background && (
                      <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
                        {item.background}
                      </p>
                    )}

                    {/* Image attachments preview */}
                    {imageAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {imageAttachments.map((att) => (
                          <button
                            key={att.id}
                            onClick={() => setPreviewImage({
                              url: getAttachmentUrl(item.id, att.id),
                              name: att.originalName,
                            })}
                            className="relative group/img rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors"
                          >
                            <img
                              src={getAttachmentUrl(item.id, att.id)}
                              alt={att.originalName}
                              className="w-24 h-24 object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                              <svg className="w-5 h-5 text-white opacity-0 group-hover/img:opacity-100 drop-shadow transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                              </svg>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Non-image attachments */}
                    {otherAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {otherAttachments.map((att) => (
                          <a
                            key={att.id}
                            href={getAttachmentUrl(item.id, att.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            title={`${att.originalName} (${formatFileSize(att.fileSize)})`}
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd"/>
                            </svg>
                            {att.originalName.length > 20 ? att.originalName.slice(0, 18) + "..." : att.originalName}
                          </a>
                        ))}
                      </div>
                    )}

                    {item.poHearingMemo && (
                      <p className="text-xs text-blue-600 mt-1">
                        {t.iceboxPoHearingMemo}: {item.poHearingMemo}
                      </p>
                    )}
                    {item.poReviewMemo && (
                      <p className="text-xs text-green-600 mt-1">
                        {t.iceboxPoReviewMemo}: {item.poReviewMemo}
                      </p>
                    )}
                    {item.freezeReason && (
                      <p className="text-xs text-gray-500 mt-1">
                        {t.iceboxFreezeReason}: {item.freezeReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {/* Move buttons */}
                    {moveTargets.map((target) => (
                      <button
                        key={target.status}
                        onClick={() => changeStatus(item.id, target.status)}
                        className={`text-xs px-2 py-1 rounded border ${target.color}`}
                      >
                        {target.label}
                      </button>
                    ))}
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-1"
                      >
                        {t.edit}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-1"
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {sectionItems.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              {t.iceboxNoItems}
            </p>
          )}
        </div>
      </div>
    )
  }

  function renderEditModal() {
    if (!editingItem) return null
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingItem(null)}>
        <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">
            {t.iceboxEditTitle}
            <span className="text-sm font-normal text-gray-500 ml-2">#{editingItem.displayId}</span>
          </h3>
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintAssignee}</label>
              <input
                type="text"
                value={editForm.author}
                onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{pt.iceboxRequest}</label>
              <textarea
                value={editForm.request}
                onChange={(e) => setEditForm({ ...editForm, request: e.target.value })}
                required
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{pt.iceboxBackground}</label>
              <textarea
                value={editForm.background}
                onChange={(e) => setEditForm({ ...editForm, background: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Attachments section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.dashboardAttachments}
              </label>

              {/* Existing attachments */}
              {editAttachments.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {editAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
                      {isImageType(att.mimeType) ? (
                        <img
                          src={getAttachmentUrl(editingItem.id, att.id)}
                          alt={att.originalName}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd"/>
                        </svg>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{att.originalName}</p>
                        <p className="text-[10px] text-gray-400">{formatFileSize(att.fileSize)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-1"
                      >
                        {t.delete}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
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
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd"/>
                </svg>
                {uploading ? t.loading : t.dashboardUploadFile}
              </button>
              <p className="text-[10px] text-gray-400 mt-1">
                PNG, JPEG, GIF, WebP, PDF, TXT (max 5MB, {editAttachments.length}/10)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.iceboxStatus}</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="unreviewed">{t.iceboxStatusUnreviewed}</option>
                <option value="reviewed">{t.iceboxStatusReviewed}</option>
                <option value="frozen">{t.iceboxStatusFrozen}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.iceboxPoHearingMemo}</label>
              <textarea
                value={editForm.poHearingMemo}
                onChange={(e) => setEditForm({ ...editForm, poHearingMemo: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.iceboxPoReviewMemo}</label>
              <textarea
                value={editForm.poReviewMemo}
                onChange={(e) => setEditForm({ ...editForm, poReviewMemo: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {editForm.status === "frozen" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.iceboxFreezeReason}</label>
                <textarea
                  value={editForm.freezeReason}
                  onChange={(e) => setEditForm({ ...editForm, freezeReason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                {t.update}
              </button>
              <button type="button" onClick={() => setEditingItem(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">
                {t.cancel}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Image preview modal
  function renderImagePreview() {
    if (!previewImage) return null
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] cursor-pointer"
        onClick={() => setPreviewImage(null)}
      >
        <div className="max-w-[90vw] max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
          <img
            src={previewImage.url}
            alt={previewImage.name}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
          <div className="absolute top-2 right-2 flex gap-2">
            <a
              href={previewImage.url}
              download
              className="p-2 bg-white/90 rounded-full shadow hover:bg-white transition-colors"
              title={t.dashboardDownload}
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-4 h-4 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </a>
            <button
              onClick={() => setPreviewImage(null)}
              className="p-2 bg-white/90 rounded-full shadow hover:bg-white transition-colors"
            >
              <svg className="w-4 h-4 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>
          <p className="text-center text-white/80 text-sm mt-2">{previewImage.name}</p>
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
        <h1 className="text-2xl font-bold">{pt.iceboxTitle}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          {t.iceboxAddRequest}
        </button>
      </div>

      {/* Search filter */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`🔍 ${pt.iceboxRequest} / ${pt.iceboxBackground}`}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-400"
        />
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">{t.iceboxNewRequest}</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.sprintAssignee}
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t.sprintAssignee}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">{t.sprintNotEntered}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {pt.iceboxRequest}
              </label>
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                required
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {pt.iceboxBackground}
              </label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {t.add}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
              >
                {t.cancel}
              </button>
            </div>
          </form>
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

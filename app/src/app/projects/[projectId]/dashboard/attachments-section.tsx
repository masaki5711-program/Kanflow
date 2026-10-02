"use client"

import { useMemo, useRef, useState } from "react"
import { Button, EmptyState, Input, cn } from "@/components/ui"
import MediaPreviewModal, { type MediaItem } from "@/components/media-preview-modal"
import { useLanguage } from "@/lib/language-context"
import { FileList } from "./file-list"
import { FolderNode, type FolderTreeDeps } from "./folder-node"
import { UPLOAD_ACCEPT, buildFolderChildMap, flattenFolders, isPreviewable, type Attachment, type Folder } from "./types"
import { useAttachments } from "./use-attachments"
import { ZONE_PAGE, ZONE_UNFILED, useAttachmentDnd } from "./use-attachment-dnd"
import { useFolderDnd } from "./use-folder-dnd"
import { LinkFormModal } from "./link-form-modal"
import { CloudUpload, FolderIcon, Link2, Paperclip } from "lucide-react"

interface AttachmentsSectionProps {
  projectId: string
  initialFolders: Folder[]
  initialAttachments: Attachment[]
}

/**
 * Attachments card: nested folders, unfiled files, uploads (button or OS
 * drag-and-drop anywhere on the card) and media preview.
 */
export function AttachmentsSection({ projectId, initialFolders, initialAttachments }: AttachmentsSectionProps) {
  const { t } = useLanguage()
  const api = useAttachments(projectId, initialFolders, initialAttachments)
  const fileDnd = useAttachmentDnd(api)
  const folderDnd = useFolderDnd(api, fileDnd.clear)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(() => new Set(initialFolders.map((f) => f.id)))
  const [newFolder, setNewFolder] = useState<{ parentId: string | null; name: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [preview, setPreview] = useState<{ items: MediaItem[]; index: number } | null>(null)

  const { folders, attachments } = api
  const childMap = useMemo(() => buildFolderChildMap(folders), [folders])
  const moveTargets = useMemo(
    () => flattenFolders(folders).map(({ folder, depth }) => ({ id: folder.id, name: folder.name, depth })),
    [folders],
  )
  const roots = childMap.get(null) ?? []
  const uploadingRoot = api.uploadTarget === null

  function toggle(folderId: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  function openPreview(file: Attachment, folderId: string | null) {
    const source = folderId ? folders.find((f) => f.id === folderId)?.attachments ?? [] : attachments
    const items: MediaItem[] = source
      .filter((a) => isPreviewable(a.mimeType))
      .map((a) => ({ id: a.id, originalName: a.originalName, mimeType: a.mimeType }))
    if (items.length === 0) return
    setPreview({ items, index: Math.max(0, items.findIndex((m) => m.id === file.id)) })
  }

  async function submitNewFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!newFolder || !newFolder.name.trim()) return
    setCreating(true)
    const folder = await api.createFolder(newFolder.name.trim(), newFolder.parentId)
    setCreating(false)
    if (!folder) return
    setOpenFolders((prev) => new Set([...prev, folder.id, ...(newFolder.parentId ? [newFolder.parentId] : [])]))
    setNewFolder(null)
  }

  const deps: FolderTreeDeps = {
    projectId,
    childMap,
    moveTargets,
    isOpen: (id) => openFolders.has(id),
    toggle,
    onNewSubfolder: (parentId) => setNewFolder({ parentId, name: "" }),
    onPreview: openPreview,
    api,
    fileDnd,
    folderDnd,
  }
  const parentName = newFolder?.parentId ? folders.find((f) => f.id === newFolder.parentId)?.name : null

  return (
    <section
      aria-labelledby="dashboard-attachments-heading"
      className={cn(
        "bg-surface rounded-ui-lg border shadow-ui-sm p-4 sm:p-6",
        fileDnd.dropTarget === ZONE_PAGE ? "border-primary bg-primary-soft/30" : "border-border",
      )}
      {...fileDnd.pageZone}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-fg-muted" />
          <h2 id="dashboard-attachments-heading" className="text-caption font-semibold text-fg-muted uppercase tracking-wider">
            {t.dashboardAttachments}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" leftIcon={<FolderIcon className="w-4 h-4" />} onClick={() => setNewFolder({ parentId: null, name: "" })}>
            {t.folderNew}
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<Link2 className="w-4 h-4" />} onClick={() => api.openLinkForm({ mode: "create", folderId: null })}>
            {t.attLinkAdd}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept={UPLOAD_ACCEPT}
            onChange={(e) => {
              const files = e.target.files
              if (files) void api.uploadFiles(files, null).finally(() => { e.target.value = "" })
            }}
          />
          <Button size="sm" leftIcon={<CloudUpload className="w-4 h-4" />} loading={uploadingRoot} onClick={() => fileInputRef.current?.click()}>
            {uploadingRoot ? t.dashboardUploading : t.dashboardUploadFile}
          </Button>
        </div>
      </div>

      {newFolder && (
        <form onSubmit={submitNewFolder} className="flex flex-wrap items-center gap-2 mb-4">
          {parentName && (
            <p className="basis-full text-caption text-fg-muted">{t.folderCreateIn.replace("{name}", parentName)}</p>
          )}
          <Input
            inputSize="sm"
            className="flex-1 min-w-[10rem]"
            aria-label={t.folderName}
            placeholder={t.folderName}
            value={newFolder.name}
            onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
            autoFocus
          />
          <Button type="submit" size="sm" loading={creating} disabled={!newFolder.name.trim()}>{t.create}</Button>
          <Button variant="secondary" size="sm" onClick={() => setNewFolder(null)}>{t.cancel}</Button>
        </form>
      )}

      {roots.length > 0 && (
        <ul>
          {roots.map((folder, i) => (
            <FolderNode key={folder.id} folder={folder} depth={0} index={i} siblingCount={roots.length} deps={deps} />
          ))}
        </ul>
      )}

      <div
        className={cn(
          "space-y-1 mt-2 min-h-[60px] rounded-ui-sm p-2 border border-dashed",
          fileDnd.dropTarget === ZONE_UNFILED ? "bg-primary-soft/60 border-primary" : "border-transparent",
        )}
        onDragOver={(e) => fileDnd.onZoneDragOver(e, ZONE_UNFILED)}
        onDragLeave={fileDnd.onZoneDragLeave}
        onDrop={(e) => fileDnd.onZoneDrop(e, null)}
      >
        {folders.length > 0 && (
          <p className="text-caption text-fg-muted mb-1">
            {t.folderUnfiled}
            <span className="ml-2 text-fg-subtle">— {t.dashboardDragHint}</span>
          </p>
        )}
        <FileList
          files={attachments}
          folderId={null}
          projectId={projectId}
          moveTargets={moveTargets}
          api={api}
          dnd={fileDnd}
          onPreview={openPreview}
        />
        {attachments.length === 0 && folders.length === 0 && (
          <EmptyState compact icon={<Paperclip className="w-6 h-6" />} title={t.dashboardNoAttachments} headingLevel={3} />
        )}
      </div>

      {api.linkForm && (
        <LinkFormModal
          form={api.linkForm}
          folderName={api.linkForm.mode === "create" && api.linkForm.folderId ? (folders.find((f) => f.id === (api.linkForm as { folderId: string }).folderId)?.name ?? null) : null}
          onSave={api.saveLink}
          onClose={() => api.openLinkForm(null)}
        />
      )}

      {preview && (
        <MediaPreviewModal projectId={projectId} items={preview.items} startIndex={preview.index} onClose={() => setPreview(null)} />
      )}
    </section>
  )
}

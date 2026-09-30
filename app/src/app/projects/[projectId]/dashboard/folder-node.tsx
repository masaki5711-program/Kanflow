"use client"

import { useRef, useState } from "react"
import { IconButton, Input, Select, Spinner, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { FileList } from "./file-list"
import { ROW_ACTIONS_VISIBILITY, type MoveTarget } from "./file-row"
import { UPLOAD_ACCEPT, isSelfOrDescendant, type Attachment, type Folder } from "./types"
import type { AttachmentsApi } from "./use-attachments"
import type { AttachmentDnd } from "./use-attachment-dnd"
import type { FolderDnd } from "./use-folder-dnd"
import { ArrowDown, ArrowUp, ChevronRight, FolderIcon, GripVertical, Pencil, Plus, X } from "lucide-react"

const ROOT_VALUE = "__root__"
const INDENT_PX = 16

/** Shared, tree-wide dependencies of every folder node. */
export interface FolderTreeDeps {
  projectId: string
  childMap: Map<string | null, Folder[]>
  moveTargets: MoveTarget[]
  isOpen: (folderId: string) => boolean
  toggle: (folderId: string) => void
  onNewSubfolder: (parentId: string) => void
  onPreview: (file: Attachment, folderId: string | null) => void
  api: AttachmentsApi
  fileDnd: AttachmentDnd
  folderDnd: FolderDnd
}

interface FolderNodeProps {
  folder: Folder
  depth: number
  index: number
  siblingCount: number
  deps: FolderTreeDeps
}

export function FolderNode({ folder, depth, index, siblingCount, deps }: FolderNodeProps) {
  const { t } = useLanguage()
  const { api, fileDnd, folderDnd, childMap } = deps
  const inputRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(folder.name)
  const children = childMap.get(folder.id) ?? []
  const open = deps.isOpen(folder.id)
  const dropMode = folderDnd.hoverModeFor(folder.id)
  const isDropZone = fileDnd.dropTarget === folder.id
  const uploading = api.uploadTarget === folder.id
  const bodyId = `folder-body-${folder.id}`
  const parentOptions = deps.moveTargets.filter(
    (f) => f.id !== (folder.parentId ?? null) && !isSelfOrDescendant(api.folders, folder.id, f.id),
  )

  function commitRename() {
    const trimmed = nameDraft.trim()
    setRenaming(false)
    if (trimmed && trimmed !== folder.name) void api.renameFolder(folder.id, trimmed)
  }

  return (
    <li
      style={{ marginLeft: depth * INDENT_PX }}
      className={cn(
        "list-none mb-2 border rounded-ui-md overflow-hidden relative",
        isDropZone ? "border-primary bg-primary-soft/40" : "border-border",
        folderDnd.draggingFolderId === folder.id && "opacity-40",
      )}
    >
      {dropMode === "before" && <div aria-hidden="true" className="absolute -top-1 left-2 right-2 h-1 bg-primary rounded-full pointer-events-none z-10" />}
      {dropMode === "after" && <div aria-hidden="true" className="absolute -bottom-1 left-2 right-2 h-1 bg-primary rounded-full pointer-events-none z-10" />}
      <div
        className={cn(
          "group flex flex-wrap items-center gap-2 px-3 py-2",
          dropMode === "nest" ? "bg-primary-soft ring-2 ring-primary ring-inset" : "bg-surface-muted",
        )}
        draggable={!renaming}
        onDragStart={(e) => folderDnd.onHeaderDragStart(e, folder.id)}
        onDragEnd={folderDnd.onHeaderDragEnd}
        onDragOver={(e) => folderDnd.onHeaderDragOver(e, folder.id)}
        onDragLeave={(e) => folderDnd.onHeaderDragLeave(e, folder.id)}
        onDrop={(e) => folderDnd.onHeaderDrop(e, folder.id)}
        title={t.folderDropZoneHint}
      >
        <span aria-hidden="true" className="hidden md:inline-flex shrink-0 cursor-grab text-fg-subtle group-hover:text-fg-muted">
          <GripVertical className="w-4 h-4" />
        </span>
        {renaming ? (
          <div className="flex flex-1 items-center gap-2 min-w-[10rem]">
            <FolderIcon className="w-5 h-5 text-amber-500" />
            <Input
              inputSize="sm"
              aria-label={t.folderEditName}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") { setNameDraft(folder.name); setRenaming(false) }
              }}
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => deps.toggle(folder.id)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex flex-1 min-w-0 items-center gap-2 text-left rounded-ui-sm min-h-8"
          >
            <ChevronRight className={cn("w-4 h-4 shrink-0 text-fg-muted transition-transform", open && "rotate-90")} />
            <FolderIcon className="w-5 h-5 text-amber-500" />
            <span className="min-w-0 truncate text-body font-medium text-fg" title={folder.name}>{folder.name}</span>
            <span className="text-caption text-fg-muted shrink-0">
              ({folder.attachments.length}{children.length > 0 ? `+${children.length}` : ""})
            </span>
            <span className="sr-only">{open ? t.folderCollapse : t.folderExpand}</span>
          </button>
        )}
        <div className={cn("flex flex-wrap items-center gap-1", ROW_ACTIONS_VISIBILITY)}>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={UPLOAD_ACCEPT}
            onChange={(e) => {
              const files = e.target.files
              if (files) void api.uploadFiles(files, folder.id).finally(() => { e.target.value = "" })
            }}
          />
          <IconButton
            size="sm"
            label={`${t.dashboardUploadFile}: ${folder.name}`}
            icon={uploading ? <Spinner size="xs" /> : <Plus className="w-4 h-4" />}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          />
          <IconButton size="sm" label={`${t.folderAddSubfolder}: ${folder.name}`} icon={<FolderIcon className="w-4 h-4" />} onClick={() => deps.onNewSubfolder(folder.id)} />
          <IconButton size="sm" label={t.folderEditName} icon={<Pencil className="w-4 h-4" />} onClick={() => { setNameDraft(folder.name); setRenaming(true) }} />
          <IconButton size="sm" label={`${t.dashboardMoveUp}: ${folder.name}`} icon={<ArrowUp className="w-4 h-4" />} disabled={index === 0} onClick={() => void api.moveFolderBy(folder.id, -1)} />
          <IconButton size="sm" label={`${t.dashboardMoveDown}: ${folder.name}`} icon={<ArrowDown className="w-4 h-4" />} disabled={index >= siblingCount - 1} onClick={() => void api.moveFolderBy(folder.id, 1)} />
          <Select
            selectSize="sm"
            className="w-auto max-w-[11rem] text-caption"
            aria-label={`${t.folderChangeParent} ${folder.name}`}
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) void api.placeFolder(folder.id, v === ROOT_VALUE ? null : v, Number.POSITIVE_INFINITY)
            }}
          >
            <option value="" disabled>{t.folderChangeParent}</option>
            {folder.parentId && <option value={ROOT_VALUE}>{t.folderRoot}</option>}
            {parentOptions.map((f) => (
              <option key={f.id} value={f.id}>{"  ".repeat(f.depth)}{f.name}</option>
            ))}
          </Select>
          <IconButton size="sm" variant="danger" label={`${t.folderDeleteTitle}: ${folder.name}`} icon={<X className="w-4 h-4" />} onClick={() => void api.deleteFolder(folder.id)} />
        </div>
      </div>
      {open && (
        <div
          id={bodyId}
          className={cn("px-3 py-2 space-y-1 min-h-[40px]", isDropZone && "bg-primary-soft/40")}
          onDragOver={(e) => fileDnd.onZoneDragOver(e, folder.id)}
          onDragLeave={fileDnd.onZoneDragLeave}
          onDrop={(e) => fileDnd.onZoneDrop(e, folder.id)}
        >
          <FileList
            files={folder.attachments}
            folderId={folder.id}
            projectId={deps.projectId}
            moveTargets={deps.moveTargets}
            api={api}
            dnd={fileDnd}
            onPreview={deps.onPreview}
          />
          {folder.attachments.length === 0 && children.length === 0 && (
            <p className="text-caption text-fg-muted py-2">{t.folderNoFiles}</p>
          )}
          {children.length > 0 && (
            <ul>
              {children.map((child, i) => (
                <FolderNode key={child.id} folder={child} depth={depth + 1} index={i} siblingCount={children.length} deps={deps} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

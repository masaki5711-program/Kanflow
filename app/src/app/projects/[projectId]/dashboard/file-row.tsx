"use client"

import { formatLongDate } from "@/lib/format-date"
import Link from "next/link"
import { memo } from "react"
import { Button, buttonClasses, cn, FileTypeIcon, IconButton, Select } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { formatFileSize, isEditableInBrowser, isPreviewable, type Attachment } from "./types"
import type { AttachmentDnd } from "./use-attachment-dnd"
import { isGitLink, isLinkEntry, linkCaption } from "@/lib/attachment-links"
import { ArrowDown, ArrowUp, Download, ExternalLink, FolderGit2, GripVertical, Link2, Pencil } from "lucide-react"

const UNFILED_VALUE = "__unfiled__"

/** Row actions are always visible below md (touch), hover/focus-revealed above. */
export const ROW_ACTIONS_VISIBILITY =
  "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity"

export interface MoveTarget {
  id: string
  name: string
  depth: number
}

interface FileRowProps {
  file: Attachment
  projectId: string
  /** Folder the row lives in; null = unfiled. */
  folderId: string | null
  isFirst: boolean
  isLast: boolean
  /** Every folder the file could be moved to (flattened, with depth). */
  moveTargets: MoveTarget[]
  onPreview: (file: Attachment) => void
  onDelete: (fileId: string) => void
  onMove: (fileId: string, targetFolderId: string | null) => void
  onMoveBy: (fileId: string, delta: -1 | 1) => void
  /** Open the link dialog for a link entry. */
  onEditLink: (file: Attachment) => void
  /** This row is the one being dragged. */
  isDragged: boolean
  /** Show the drop-insertion marker above this row. */
  showInsert: boolean
  /** Must be referentially stable (see FileList) for the memo to hold. */
  dndHandlers: FileRowDndHandlers
}

export type FileRowDndHandlers = Pick<AttachmentDnd, "onRowDragOver" | "onRowDrop" | "onFileDragStart" | "clear">

/** Memoized: FileList passes stable handlers and per-row drag booleans. */
export const FileRow = memo(function FileRow({
  file, projectId, folderId, isFirst, isLast, moveTargets, onPreview, onDelete, onMove, onMoveBy, onEditLink, isDragged, showInsert, dndHandlers: dnd,
}: FileRowProps) {
  const { t, language } = useLanguage()
  const isLink = isLinkEntry(file) && !!file.linkUrl
  const targets = moveTargets.filter((f) => f.id !== folderId)
  const canMove = folderId !== null || targets.length > 0
  const fileUrl = `/api/projects/${projectId}/attachments/${file.id}`

  return (
    <li className="relative list-none">
      {showInsert && (
        <div aria-hidden="true" className="absolute -top-1 left-2 right-2 h-1 bg-primary rounded-full pointer-events-none z-10" />
      )}
      <div
        onDragOver={(e) => dnd.onRowDragOver(e, file.id)}
        onDrop={(e) => dnd.onRowDrop(e, file.id, folderId)}
        className={cn(
          "flex flex-wrap items-center gap-2 bg-surface-muted rounded-ui-sm px-2 py-2 group hover:bg-surface-sunken",
          isDragged && "opacity-40",
          showInsert && "mt-3",
        )}
      >
        <span
          draggable
          onDragStart={(e) => dnd.onFileDragStart(e, file.id, folderId)}
          onDragEnd={dnd.clear}
          className="hidden md:inline-flex shrink-0 cursor-grab active:cursor-grabbing text-fg-subtle hover:text-fg-muted select-none"
          title={t.dashboardDragHandle}
          aria-hidden="true"
        >
          <GripVertical className="w-4 h-4" />
        </span>
        {isLink ? (
          <LinkIcon url={file.linkUrl as string} />
        ) : (
          <span className="shrink-0"><FileTypeIcon mimeType={file.mimeType} /></span>
        )}
        <div className="flex-1 min-w-0">
          {isLink ? (
            <LinkTitle file={file} openLabel={t.attLinkOpen} />
          ) : isPreviewable(file.mimeType) ? (
            <button
              type="button"
              onClick={() => onPreview(file)}
              className="text-body font-medium text-primary hover:text-primary-hover hover:underline truncate block text-left w-full"
              title={file.originalName}
            >
              {file.originalName}
            </button>
          ) : (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body font-medium text-primary hover:text-primary-hover hover:underline truncate block"
              title={file.originalName}
            >
              {file.originalName}
            </a>
          )}
          <div className="flex min-w-0 gap-3 text-caption text-fg-muted">
            {isLink ? <span className="min-w-0 truncate" title={file.linkUrl ?? ""}>{linkCaption(file.linkUrl as string)}</span> : <span>{formatFileSize(file.fileSize)}</span>}
            <span>{formatLongDate(file.createdAt, language)}</span>
          </div>
        </div>
        <div className={cn("flex flex-wrap items-center gap-1", ROW_ACTIONS_VISIBILITY)}>
          <IconButton
            size="sm"
            label={`${t.dashboardMoveUp}: ${file.originalName}`}
            icon={<ArrowUp className="w-4 h-4" />}
            disabled={isFirst}
            onClick={() => onMoveBy(file.id, -1)}
          />
          <IconButton
            size="sm"
            label={`${t.dashboardMoveDown}: ${file.originalName}`}
            icon={<ArrowDown className="w-4 h-4" />}
            disabled={isLast}
            onClick={() => onMoveBy(file.id, 1)}
          />
          {isLink && (
            <IconButton size="sm" label={`${t.attLinkEdit}: ${file.originalName}`} icon={<Pencil className="w-4 h-4" />} onClick={() => onEditLink(file)} />
          )}
          {!isLink && isEditableInBrowser(file.mimeType) && (
            <Link
              href={`/projects/${projectId}/editor/${file.id}`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              {t.edit}
            </Link>
          )}
          {canMove && (
            <Select
              selectSize="sm"
              className="w-auto max-w-[11rem] text-caption"
              aria-label={`${t.folderMoveTo} ${file.originalName}`}
              value=""
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                onMove(file.id, v === UNFILED_VALUE ? null : v)
              }}
            >
              <option value="" disabled>{t.folderMoveTo}</option>
              {folderId && <option value={UNFILED_VALUE}>{t.folderUnfiled}</option>}
              {targets.map((f) => (
                <option key={f.id} value={f.id}>{"  ".repeat(f.depth)}{f.name}</option>
              ))}
            </Select>
          )}
          {!isLink && (
            <a
              href={`${fileUrl}?download=1`}
              download
              className={buttonClasses({ variant: "ghost", size: "sm", className: "w-8 px-0" })}
              aria-label={`${t.dashboardDownload}: ${file.originalName}`}
              title={t.dashboardDownload}
            >
              <Download className="w-4 h-4" />
            </a>
          )}
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => onDelete(file.id)} aria-label={`${t.delete}: ${file.originalName}`}>
            {t.delete}
          </Button>
        </div>
      </div>
    </li>
  )
})

/** Repository-style icon for GitLab / .git URLs, a chain link for anything else. */
function LinkIcon({ url }: { url: string }) {
  const git = isGitLink(url)
  const Icon = git ? FolderGit2 : Link2
  return (
    <span aria-hidden="true" className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-sm", git ? "bg-orange-50 text-orange-700" : "bg-primary-soft text-primary-strong")}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

/** The link's name opening the URL in a new tab (noopener: the target cannot reach this page). */
function LinkTitle({ file, openLabel }: { file: Attachment; openLabel: string }) {
  return (
    <a
      href={file.linkUrl as string}
      target="_blank"
      rel="noopener noreferrer"
      data-attachment-link={file.id}
      className="inline-flex max-w-full items-center gap-1 text-body font-medium text-primary hover:text-primary-hover hover:underline"
      title={`${file.originalName} — ${openLabel}`}
    >
      <span className="truncate">{file.originalName}</span>
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </a>
  )
}

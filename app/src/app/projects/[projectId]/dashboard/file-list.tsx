"use client"

import { useStableHandlers } from "@/hooks"
import type { Attachment } from "./types"
import type { AttachmentsApi } from "./use-attachments"
import type { AttachmentDnd } from "./use-attachment-dnd"
import { FileRow, type FileRowDndHandlers, type MoveTarget } from "./file-row"

interface FileListProps {
  files: Attachment[]
  folderId: string | null
  projectId: string
  moveTargets: MoveTarget[]
  api: AttachmentsApi
  dnd: AttachmentDnd
  onPreview: (file: Attachment, folderId: string | null) => void
}

/** Ordered attachment rows of one folder (or of the unfiled area). */
export function FileList({ files, folderId, projectId, moveTargets, api, dnd, onPreview }: FileListProps) {
  // Stable handler identities keep the memoized rows from re-rendering on
  // every parent render (the dnd object and api are rebuilt each time).
  const rowHandlers = useStableHandlers({
    onPreview: (f: Attachment) => onPreview(f, folderId),
    onDelete: (id: string) => void api.deleteAttachment(id, folderId),
    onMove: (id: string, target: string | null) => void api.placeAttachment(id, folderId, target),
    onMoveBy: (id: string, delta: -1 | 1) => void api.moveAttachmentBy(id, folderId, delta),
  })
  const dndHandlers = useStableHandlers<FileRowDndHandlers>({
    onRowDragOver: dnd.onRowDragOver,
    onRowDrop: dnd.onRowDrop,
    onFileDragStart: dnd.onFileDragStart,
    clear: dnd.clear,
  })

  if (files.length === 0) return null
  return (
    <ul className="space-y-1">
      {files.map((file, index) => {
        const isDragged = dnd.draggingFileId === file.id
        return (
          <FileRow
            key={file.id}
            file={file}
            projectId={projectId}
            folderId={folderId}
            isFirst={index === 0}
            isLast={index === files.length - 1}
            moveTargets={moveTargets}
            {...rowHandlers}
            isDragged={isDragged}
            showInsert={dnd.insertBeforeFileId === file.id && !isDragged}
            dndHandlers={dndHandlers}
          />
        )
      })}
    </ul>
  )
}

"use client"

import { useState, type DragEvent } from "react"
import type { AttachmentsApi } from "./use-attachments"

/** Internal drag MIME identifiers — distinguish a Kanflow drag from an OS file drag. */
export const MIME_FILE = "application/x-kanflow-file"
export const MIME_FOLDER = "application/x-kanflow-folder"
/** Drop-zone keys for the non-folder zones. */
export const ZONE_UNFILED = "__unfiled__"
export const ZONE_PAGE = "__page__"

export interface FileDragPayload {
  fileId: string
  sourceFolderId: string | null
}

export function hasType(e: DragEvent, type: string): boolean {
  return Array.from(e.dataTransfer.types).includes(type)
}

export function readFilePayload(e: DragEvent): FileDragPayload | null {
  const raw = e.dataTransfer.getData(MIME_FILE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<FileDragPayload>
    if (typeof parsed.fileId !== "string") return null
    return { fileId: parsed.fileId, sourceFolderId: parsed.sourceFolderId ?? null }
  } catch {
    return null
  }
}

function hasOsFiles(e: DragEvent): boolean {
  return (e.dataTransfer.files?.length ?? 0) > 0
}

/**
 * Native HTML5 drag-and-drop for attachment rows and drop zones (folder
 * bodies, the unfiled area and the whole attachments card). OS files dropped
 * anywhere are uploaded to the zone they land in. Keyboard users get the same
 * operations through the row's ↑↓ buttons and "Move..." select.
 */
export function useAttachmentDnd(api: AttachmentsApi) {
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null)
  const [insertBeforeFileId, setInsertBeforeFileId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  function clear() {
    setDraggingFileId(null)
    setInsertBeforeFileId(null)
    setDropTarget(null)
  }

  function onFileDragStart(e: DragEvent, fileId: string, sourceFolderId: string | null) {
    setDraggingFileId(fileId)
    setInsertBeforeFileId(null)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData(MIME_FILE, JSON.stringify({ fileId, sourceFolderId } satisfies FileDragPayload))
  }

  /** Hovering a row: internal drags show the insert line; OS drags bubble up to the zone. */
  function onRowDragOver(e: DragEvent, fileId: string) {
    if (hasType(e, MIME_FILE)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      if (insertBeforeFileId !== fileId) setInsertBeforeFileId(fileId)
    } else if (hasType(e, "Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    }
  }

  /** Drop a Kanflow file ONTO another row → insert before it. OS files bubble to the zone. */
  function onRowDrop(e: DragEvent, beforeFileId: string, targetFolderId: string | null) {
    const payload = readFilePayload(e)
    if (!payload) return
    e.preventDefault()
    e.stopPropagation()
    clear()
    void api.placeAttachment(payload.fileId, payload.sourceFolderId, targetFolderId, beforeFileId)
  }

  function onZoneDragOver(e: DragEvent, zoneKey: string) {
    if (hasType(e, MIME_FILE) || hasType(e, MIME_FOLDER) || hasType(e, "Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = hasType(e, "Files") ? "copy" : "move"
      if (dropTarget !== zoneKey) setDropTarget(zoneKey)
    }
  }

  function onZoneDragLeave(e: DragEvent) {
    // Ignore leave events fired when moving between children of the zone.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropTarget(null)
  }

  /** Drop onto a folder body / the unfiled area (targetFolderId null) → append / move there. */
  function onZoneDrop(e: DragEvent, targetFolderId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    clear()
    if (hasOsFiles(e)) {
      void api.uploadFiles(e.dataTransfer.files, targetFolderId)
      return
    }
    const folderId = e.dataTransfer.getData(MIME_FOLDER)
    if (folderId) {
      if (folderId !== targetFolderId) void api.placeFolder(folderId, targetFolderId, Number.POSITIVE_INFINITY)
      return
    }
    const payload = readFilePayload(e)
    if (payload && payload.sourceFolderId !== targetFolderId) {
      void api.placeAttachment(payload.fileId, payload.sourceFolderId, targetFolderId)
    }
  }

  /** Outermost card: OS files dropped outside any specific zone go to the unfiled area. */
  const pageZone = {
    onDragOver(e: DragEvent) {
      if (!hasType(e, "Files")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      if (dropTarget !== ZONE_PAGE) setDropTarget(ZONE_PAGE)
    },
    onDragLeave(e: DragEvent) {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setDropTarget(null)
    },
    onDrop(e: DragEvent) {
      if (!hasOsFiles(e)) return
      e.preventDefault()
      setDropTarget(null)
      void api.uploadFiles(e.dataTransfer.files, null)
    },
  }

  return {
    draggingFileId,
    insertBeforeFileId,
    dropTarget,
    clear,
    onFileDragStart,
    onRowDragOver,
    onRowDrop,
    onZoneDragOver,
    onZoneDragLeave,
    onZoneDrop,
    pageZone,
  }
}

export type AttachmentDnd = ReturnType<typeof useAttachmentDnd>

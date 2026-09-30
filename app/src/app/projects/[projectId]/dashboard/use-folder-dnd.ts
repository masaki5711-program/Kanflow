"use client"

import { useState, type DragEvent } from "react"
import type { AttachmentsApi } from "./use-attachments"
import type { FolderDropMode } from "./types"
import { MIME_FILE, MIME_FOLDER, hasType, readFilePayload } from "./use-attachment-dnd"

/** Fraction of the header height treated as the "insert before/after" edge. */
const EDGE_ZONE = 0.25

function modeFromPointer(e: DragEvent): FolderDropMode {
  const rect = e.currentTarget.getBoundingClientRect()
  const offset = (e.clientY - rect.top) / Math.max(1, rect.height)
  if (offset < EDGE_ZONE) return "before"
  if (offset > 1 - EDGE_ZONE) return "after"
  return "nest"
}

/**
 * Native drag-and-drop on folder headers. For folder drags the cursor zone
 * picks the intent (top quarter = before, middle = nest, bottom quarter =
 * after); files and OS files dropped on a header always go INTO the folder.
 * Keyboard users use the header's ↑↓ buttons and "Change parent folder..."
 * select instead.
 */
export function useFolderDnd(api: AttachmentsApi, onFinished: () => void) {
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ id: string; mode: FolderDropMode } | null>(null)

  function clear() {
    setDraggingFolderId(null)
    setHover(null)
  }

  function onHeaderDragStart(e: DragEvent, folderId: string) {
    setDraggingFolderId(folderId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData(MIME_FOLDER, folderId)
    // Some browsers drop custom MIME types without a text payload.
    e.dataTransfer.setData("text/plain", `folder:${folderId}`)
  }

  function onHeaderDragEnd() {
    clear()
    onFinished()
  }

  function onHeaderDragOver(e: DragEvent, folderId: string) {
    const isFolder = hasType(e, MIME_FOLDER)
    if (!isFolder && !hasType(e, MIME_FILE) && !hasType(e, "Files")) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = hasType(e, "Files") ? "copy" : "move"
    const mode = isFolder ? modeFromPointer(e) : "nest"
    if (hover?.id !== folderId || hover.mode !== mode) setHover({ id: folderId, mode })
  }

  function onHeaderDragLeave(e: DragEvent, folderId: string) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setHover((cur) => (cur?.id === folderId ? null : cur))
  }

  function onHeaderDrop(e: DragEvent, targetFolderId: string) {
    e.preventDefault()
    e.stopPropagation()
    const mode = hover?.id === targetFolderId ? hover.mode : "nest"
    clear()
    onFinished()
    if ((e.dataTransfer.files?.length ?? 0) > 0) {
      void api.uploadFiles(e.dataTransfer.files, targetFolderId)
      return
    }
    const draggedFolder = e.dataTransfer.getData(MIME_FOLDER)
    if (draggedFolder) {
      if (draggedFolder !== targetFolderId) void api.dropFolder(draggedFolder, targetFolderId, mode)
      return
    }
    const payload = readFilePayload(e)
    if (payload && payload.sourceFolderId !== targetFolderId) {
      void api.placeAttachment(payload.fileId, payload.sourceFolderId, targetFolderId)
    }
  }

  /** Drop intent currently shown on `folderId`'s header, if any. */
  function hoverModeFor(folderId: string): FolderDropMode | null {
    return hover?.id === folderId ? hover.mode : null
  }

  return {
    draggingFolderId,
    clear,
    hoverModeFor,
    onHeaderDragStart,
    onHeaderDragEnd,
    onHeaderDragOver,
    onHeaderDragLeave,
    onHeaderDrop,
  }
}

export type FolderDnd = ReturnType<typeof useFolderDnd>

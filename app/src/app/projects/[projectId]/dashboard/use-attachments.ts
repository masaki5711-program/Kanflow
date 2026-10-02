"use client"

import { useRef, useState } from "react"
import { apiFetch } from "@/hooks"
import { useToast, useConfirm } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { compressImageFile } from "@/lib/image-compress"
import {
  buildFolderChildMap,
  isSelfOrDescendant,
  type Attachment,
  type Folder,
  type FolderDropMode,
} from "./types"

interface Snapshot {
  folders: Folder[]
  attachments: Attachment[]
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/** Replace the file list of `folderId` (null = unfiled) inside a snapshot. */
function withList(snap: Snapshot, folderId: string | null, list: Attachment[]): Snapshot {
  if (!folderId) return { ...snap, attachments: list }
  return { ...snap, folders: snap.folders.map((f) => (f.id === folderId ? { ...f, attachments: list } : f)) }
}

function listOf(snap: Snapshot, folderId: string | null): Attachment[] {
  return folderId ? snap.folders.find((f) => f.id === folderId)?.attachments ?? [] : snap.attachments
}

/**
 * Client state + server mutations for the dashboard attachments area
 * (files and nested folders). Every mutation is optimistic where the result
 * is known up front and rolls back (with an error toast) when the server
 * rejects it.
 */
export function useAttachments(projectId: string, initialFolders: Folder[], initialAttachments: Attachment[]) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const [state, setState] = useState<Snapshot>({ folders: initialFolders, attachments: initialAttachments })
  // Latest committed state for async flows (avoids stale closures between
  // awaits). Every update goes through `commit`, which keeps it in sync.
  const stateRef = useRef(state)
  // Folder currently receiving uploads: undefined = idle, null = unfiled.
  const [uploadTarget, setUploadTarget] = useState<string | null | undefined>(undefined)

  const base = `/api/projects/${projectId}`

  function commit(next: Snapshot) {
    stateRef.current = next
    setState(next)
  }

  function fail(err: unknown, title: string, rollbackTo?: Snapshot) {
    if (rollbackTo) commit(rollbackTo)
    toast.error(errorMessage(err, title), { title })
  }

  // ── Files ───────────────────────────────────────────────────────────────

  async function uploadFiles(files: File[] | FileList, folderId: string | null) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploadTarget(folderId)
    try {
      for (const rawFile of list) {
        const file = rawFile.type.startsWith("image/") ? await compressImageFile(rawFile) : rawFile
        const formData = new FormData()
        formData.append("file", file)
        if (folderId) formData.append("folderId", folderId)
        const saved = await apiFetch<Attachment>(`${base}/attachments`, { method: "POST", body: formData })
        const snap = stateRef.current
        commit(withList(snap, folderId, [saved, ...listOf(snap, folderId)]))
      }
    } catch (err) {
      fail(err, t.dashboardUploadFailed)
    } finally {
      setUploadTarget(undefined)
    }
  }

  // ── Links (e.g. GitLab repositories) ───────────────────────────────────

  const [linkForm, setLinkForm] = useState<LinkFormState | null>(null)

  /** Create (form in "create" mode) or update (edit mode) a link entry. Returns true on success. */
  async function saveLink(name: string, url: string): Promise<boolean> {
    const form = linkForm
    if (!form) return false
    try {
      if (form.mode === "create") {
        const saved = await apiFetch<Attachment>(`${base}/attachments/links`, { method: "POST", json: { name, url, folderId: form.folderId } })
        const snap = stateRef.current
        commit(withList(snap, form.folderId, [saved, ...listOf(snap, form.folderId)]))
        toast.success(t.attLinkAdded)
      } else {
        const saved = await apiFetch<Attachment>(`${base}/attachments/${form.file.id}`, { method: "PATCH", json: { name: name || form.file.originalName, url } })
        const snap = stateRef.current
        const folderId = form.file.folderId
        commit(withList(snap, folderId, listOf(snap, folderId).map((a) => (a.id === saved.id ? { ...a, ...saved } : a))))
        toast.success(t.attLinkSaved)
      }
      setLinkForm(null)
      return true
    } catch (err) {
      fail(err, t.attLinkAddFailed)
      return false
    }
  }

  async function deleteAttachment(attachmentId: string, folderId: string | null) {
    const ok = await confirm({ message: t.dashboardDeleteAttachmentConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    const prev = stateRef.current
    commit(withList(prev, folderId, listOf(prev, folderId).filter((a) => a.id !== attachmentId)))
    try {
      await apiFetch(`${base}/attachments/${attachmentId}`, { method: "DELETE" })
    } catch (err) {
      fail(err, t.dashboardDeleteFailed, prev)
    }
  }

  /** Persist the order of one list (sortOrder = index). */
  async function persistFileOrder(list: Attachment[]) {
    await Promise.all(
      list.map((a, idx) => apiFetch(`${base}/attachments/${a.id}`, { method: "PATCH", json: { sortOrder: idx } })),
    )
  }

  /**
   * Put a file into `targetFolderId` (null = unfiled). With `beforeId` the
   * file is inserted just before that row and the whole list's order is
   * persisted; without it the file is prepended (plain "move to folder").
   */
  async function placeAttachment(
    attachmentId: string,
    sourceFolderId: string | null,
    targetFolderId: string | null,
    beforeId?: string | null,
  ) {
    const prev = stateRef.current
    const moved = listOf(prev, sourceFolderId).find((a) => a.id === attachmentId)
    if (!moved || attachmentId === beforeId) return
    const crossFolder = sourceFolderId !== targetFolderId
    let next = crossFolder ? withList(prev, sourceFolderId, listOf(prev, sourceFolderId).filter((a) => a.id !== attachmentId)) : prev
    const targetWithout = listOf(next, targetFolderId).filter((a) => a.id !== attachmentId)
    const updated = { ...moved, folderId: targetFolderId }
    const reorder = beforeId !== undefined
    const insertAt = !reorder
      ? 0
      : beforeId === null
        ? targetWithout.length
        : Math.max(0, targetWithout.findIndex((a) => a.id === beforeId))
    const targetList = [...targetWithout.slice(0, insertAt), updated, ...targetWithout.slice(insertAt)]
    next = withList(next, targetFolderId, targetList)
    commit(next)
    try {
      if (crossFolder) {
        await apiFetch(`${base}/attachments/${attachmentId}`, { method: "PATCH", json: { folderId: targetFolderId } })
      }
      if (reorder) await persistFileOrder(targetList)
    } catch (err) {
      fail(err, t.dashboardMoveFailed, prev)
    }
  }

  /** Keyboard reorder: move a file one row up (-1) or down (+1) in its list. */
  async function moveAttachmentBy(attachmentId: string, folderId: string | null, delta: -1 | 1) {
    const prev = stateRef.current
    const list = listOf(prev, folderId)
    const idx = list.findIndex((a) => a.id === attachmentId)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    commit(withList(prev, folderId, next))
    try {
      await persistFileOrder(next)
    } catch (err) {
      fail(err, t.dashboardMoveFailed, prev)
    }
  }

  // ── Folders ─────────────────────────────────────────────────────────────

  async function createFolder(name: string, parentId: string | null): Promise<Folder | null> {
    try {
      const folder = await apiFetch<Folder>(`${base}/folders`, { method: "POST", json: { name, parentId } })
      const snap = stateRef.current
      commit({ ...snap, folders: [...snap.folders, { ...folder, attachments: folder.attachments ?? [] }] })
      return folder
    } catch (err) {
      fail(err, t.errorCreationFailed)
      return null
    }
  }

  async function renameFolder(folderId: string, name: string) {
    const prev = stateRef.current
    commit({ ...prev, folders: prev.folders.map((f) => (f.id === folderId ? { ...f, name } : f)) })
    try {
      await apiFetch(`${base}/folders/${folderId}`, { method: "PATCH", json: { name } })
    } catch (err) {
      fail(err, t.errorUpdateFailed, prev)
    }
  }

  async function deleteFolder(folderId: string) {
    const ok = await confirm({ message: t.folderDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    try {
      await apiFetch(`${base}/folders/${folderId}`, { method: "DELETE" })
      const snap = stateRef.current
      const folder = snap.folders.find((f) => f.id === folderId)
      commit({
        folders: snap.folders.filter((f) => f.id !== folderId),
        attachments: [...(folder?.attachments ?? []).map((a) => ({ ...a, folderId: null })), ...snap.attachments],
      })
    } catch (err) {
      fail(err, t.dashboardDeleteFailed)
    }
  }

  /**
   * Move `draggedId` under `parentId` at sibling position `index` (Infinity =
   * append). Persists the parent change first, then every sibling's order.
   */
  async function placeFolder(draggedId: string, parentId: string | null, index: number) {
    const prev = stateRef.current
    const dragged = prev.folders.find((f) => f.id === draggedId)
    if (!dragged || isSelfOrDescendant(prev.folders, draggedId, parentId)) return
    const siblings = (buildFolderChildMap(prev.folders).get(parentId) ?? []).filter((f) => f.id !== draggedId)
    const at = Math.max(0, Math.min(index, siblings.length))
    const order = [...siblings.slice(0, at), dragged, ...siblings.slice(at)]
    const orderIndex = new Map(order.map((f, i) => [f.id, i]))
    commit({
      ...prev,
      folders: prev.folders.map((f) => {
        const i = orderIndex.get(f.id)
        if (f.id === draggedId) return { ...f, parentId, sortOrder: i }
        return i === undefined ? f : { ...f, sortOrder: i }
      }),
    })
    try {
      if ((dragged.parentId ?? null) !== parentId) {
        await apiFetch(`${base}/folders/${draggedId}`, { method: "PATCH", json: { parentId } })
      }
      await Promise.all(
        order.map((f, idx) => apiFetch(`${base}/folders/${f.id}`, { method: "PATCH", json: { sortOrder: idx } })),
      )
    } catch (err) {
      fail(err, t.dashboardMoveFailed, prev)
    }
  }

  /** Drop a folder relative to another folder (drag or keyboard). */
  async function dropFolder(draggedId: string, targetId: string, mode: FolderDropMode) {
    if (draggedId === targetId) return
    const folders = stateRef.current.folders
    const target = folders.find((f) => f.id === targetId)
    if (!target) return
    if (mode === "nest") {
      await placeFolder(draggedId, targetId, Number.POSITIVE_INFINITY)
      return
    }
    const parentId = target.parentId ?? null
    const siblings = (buildFolderChildMap(folders).get(parentId) ?? []).filter((f) => f.id !== draggedId)
    const targetIdx = siblings.findIndex((f) => f.id === targetId)
    await placeFolder(draggedId, parentId, mode === "before" ? targetIdx : targetIdx + 1)
  }

  /** Keyboard reorder of a folder among its siblings. */
  async function moveFolderBy(folderId: string, delta: -1 | 1) {
    const folders = stateRef.current.folders
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return
    const parentId = folder.parentId ?? null
    const siblings = buildFolderChildMap(folders).get(parentId) ?? []
    const idx = siblings.findIndex((f) => f.id === folderId)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= siblings.length) return
    await placeFolder(folderId, parentId, target)
  }

  return {
    folders: state.folders,
    attachments: state.attachments,
    uploadTarget,
    uploadFiles,
    deleteAttachment,
    placeAttachment,
    moveAttachmentBy,
    createFolder,
    renameFolder,
    deleteFolder,
    placeFolder,
    dropFolder,
    moveFolderBy,
    linkForm,
    openLinkForm: setLinkForm,
    saveLink,
  }
}

/** The link dialog: add to a folder (null = unfiled) or edit an existing link. */
export type LinkFormState = { mode: "create"; folderId: string | null } | { mode: "edit"; file: Attachment }

export type AttachmentsApi = ReturnType<typeof useAttachments>

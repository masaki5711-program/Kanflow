"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch, isAbortError, isApiError, useUnsavedChangesGuard } from "@/hooks"
import { createAutosave, PermanentSaveError, type Autosave, type SaveStatus } from "@/lib/board/autosave"
import {
  acknowledge,
  batchWrites,
  canRedo,
  canUndo,
  changedWrites,
  commit,
  docFromStored,
  hasUnsavedChanges,
  initialState,
  markAttempted,
  rebaseStale,
  redo,
  undo,
  type EditorState,
  type Patch,
  type SavedVersions,
} from "@/lib/board/doc"
import type { ElementMap } from "@/lib/board/geometry"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { sheetUrl, type ElementWriteResult, type SheetElementsDto } from "./board-api"

export interface SheetDocument {
  load: "loading" | "ready" | "error"
  loadError: string | null
  reload: () => void
  elements: ElementMap
  /** Applies a user change as one undo step and schedules the save. */
  commit: (patch: Patch) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  saveStatus: SaveStatus
  /** Why the last save failed (localized server message), while `saveStatus` is "failed". */
  saveError: string | null
  /** A failed save is tried again automatically (false: the server refused it, only a change or the retry button sends again). */
  saveRetries: boolean
  /** Saves now (retry button, before leaving the sheet). Resolves true when nothing is left unsaved. */
  flush: () => Promise<boolean>
}

/**
 * A request the server refused for good: trying the same bytes again cannot help. Not 401 / 403 (a session that
 * ran out can be signed in again in another tab: the retry then succeeds), nor 408 / 429 (try later).
 */
function isRefusal(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500 && ![401, 403, 408, 429].includes(error.status)
}

/**
 * The document of one sheet in the editor: loads the elements, keeps the undo history and saves what
 * changed (only the changed elements, one request at a time, debounced). The pure parts live in
 * `@/lib/board/doc` and `@/lib/board/autosave`; this hook only connects them to React and the API.
 */
export function useSheetDocument(projectId: string, boardId: string, sheetId: string, canWrite: boolean): SheetDocument {
  const elementsUrl = `${sheetUrl(projectId, boardId, sheetId)}/elements`

  const [state, setState] = useState<EditorState>(() => initialState())
  const [load, setLoad] = useState<{ status: SheetDocument["load"]; error: string | null }>({ status: "loading", error: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [save, setSave] = useState<{ status: SaveStatus; error: string | null; retries: boolean }>({ status: "saved", error: null, retries: true })

  // The save reads the newest document without waiting for a render.
  const stateRef = useRef(state)
  const savedRef = useRef<SavedVersions>({})
  const autosaveRef = useRef<Autosave | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<SheetElementsDto>(elementsUrl, { signal: controller.signal })
      .then((dto) => {
        const { doc, saved } = docFromStored(dto.elements)
        savedRef.current = saved
        stateRef.current = initialState(doc)
        setState(stateRef.current)
        setLoad({ status: "ready", error: null })
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setLoad({ status: "error", error: error instanceof Error ? error.message : null })
      })
    return () => controller.abort()
  }, [elementsUrl, reloadKey])

  useEffect(() => {
    async function saveChanges() {
      const writes = changedWrites(stateRef.current.doc, savedRef.current)
      // 1 KB of the body budget is left for the envelope around the elements.
      for (const batch of batchWrites(writes, BOARD_LIMITS.elementsPerWrite, BOARD_LIMITS.writeBodyBytes - 1024)) {
        let result: ElementWriteResult
        try {
          result = await apiFetch<ElementWriteResult>(elementsUrl, { method: "POST", json: { elements: batch } })
        } catch (error) {
          if (isRefusal(error)) throw new PermanentSaveError(error instanceof Error ? error.message : "")
          // No answer: the server may hold the batch or not.
          savedRef.current = markAttempted(savedRef.current, batch)
          throw error
        }
        savedRef.current = acknowledge(savedRef.current, batch, result.stale)
        if (result.stale.length > 0) {
          // The server holds a newer version: this client's content goes above it and is sent again.
          stateRef.current = { ...stateRef.current, doc: rebaseStale(stateRef.current.doc, result.stale) }
          setState(stateRef.current)
        }
      }
    }
    const autosave = createAutosave({
      save: saveChanges,
      hasChanges: () => hasUnsavedChanges(stateRef.current.doc, savedRef.current),
      onStatus: (status, error) =>
        setSave({
          status,
          error: status === "failed" && error instanceof Error && error.message ? error.message : null,
          retries: !(error instanceof PermanentSaveError),
        }),
    })
    autosaveRef.current = autosave
    return () => {
      autosaveRef.current = null
      // Leaving the sheet: what is still unsaved gets one last attempt.
      void autosave.flush().finally(() => autosave.dispose())
    }
  }, [elementsUrl])

  const change = useCallback(
    (fn: (current: EditorState) => EditorState) => {
      if (!canWrite) return
      const next = fn(stateRef.current)
      if (next === stateRef.current) return
      stateRef.current = next
      setState(next)
      autosaveRef.current?.changed()
    },
    [canWrite],
  )

  const commitPatch = useCallback((patch: Patch) => change((current) => commit(current, patch)), [change])
  const undoStep = useCallback(() => change(undo), [change])
  const redoStep = useCallback(() => change(redo), [change])
  const flush = useCallback(() => autosaveRef.current?.flush() ?? Promise.resolve(true), [])
  const reload = useCallback(() => {
    setLoad({ status: "loading", error: null })
    setReloadKey((key) => key + 1)
  }, [])

  useUnsavedChangesGuard(save.status !== "saved")

  return {
    load: load.status,
    loadError: load.error,
    reload,
    elements: state.doc.elements,
    commit: commitPatch,
    undo: undoStep,
    redo: redoStep,
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    saveStatus: save.status,
    saveError: save.error,
    saveRetries: save.retries,
    flush,
  }
}

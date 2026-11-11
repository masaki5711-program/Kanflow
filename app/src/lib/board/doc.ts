import { jsonEqual } from "./equal"
import type { ElementMap } from "./geometry"
import { elementFromData, elementToData, type BoardElement, type ElementWrite, type StoredElement } from "./model"

/**
 * The editor's document of one sheet, its undo history and what still has to be saved.
 *
 * Every change is a `Patch` (element id → the element after the change, or null = deleted). Applying a patch
 * returns the new document and the inverse patch; the history is a stack of such pairs. Each element has a
 * version that grows by one whenever its content changes here — also on undo, which is a change like any
 * other — so "what changed since the last save" is a comparison of two version maps.
 */

export interface BoardDoc {
  /** The live elements. */
  elements: ElementMap
  /** Version of every element this client has seen, deleted ones included. */
  versions: Readonly<Record<string, number>>
}

export type Patch = Readonly<Record<string, BoardElement | null>>

/** The versions the server is known to hold. */
export type SavedVersions = Readonly<Record<string, number>>

export const EMPTY_DOC: BoardDoc = { elements: {}, versions: {} }

/** The document of a sheet as read from the API (a full read, or a delta applied to nothing). */
export function docFromStored(stored: readonly StoredElement[]): { doc: BoardDoc; saved: SavedVersions } {
  const elements: Record<string, BoardElement> = {}
  const versions: Record<string, number> = {}
  for (const row of stored) {
    versions[row.id] = row.version
    if (!row.deleted) elements[row.id] = elementFromData(row.id, row.data)
  }
  return { doc: { elements, versions }, saved: { ...versions } }
}

/**
 * Applies a patch. Entries that change nothing are skipped (no version bump); elements of an unknown type
 * are never touched. `inverse` restores exactly what was there.
 */
export function applyPatch(doc: BoardDoc, patch: Patch): { doc: BoardDoc; inverse: Patch; changed: boolean } {
  const elements: Record<string, BoardElement> = { ...doc.elements }
  const versions: Record<string, number> = { ...doc.versions }
  const inverse: Record<string, BoardElement | null> = {}
  let changed = false
  for (const [id, after] of Object.entries(patch)) {
    const before = elements[id] ?? null
    if (before?.type === "unknown" || after?.type === "unknown") continue
    if (before === null ? after === null : after !== null && jsonEqual(before, after)) continue
    inverse[id] = before
    if (after === null) delete elements[id]
    else elements[id] = after
    versions[id] = (versions[id] ?? 0) + 1
    changed = true
  }
  return changed ? { doc: { elements, versions }, inverse, changed } : { doc, inverse, changed }
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  undo: Patch
  redo: Patch
}

export interface EditorState {
  doc: BoardDoc
  undoStack: readonly HistoryEntry[]
  redoStack: readonly HistoryEntry[]
}

/** Steps kept; older ones fall off the bottom. */
export const HISTORY_LIMIT = 100

export function initialState(doc: BoardDoc = EMPTY_DOC): EditorState {
  return { doc, undoStack: [], redoStack: [] }
}

/** Applies a user change as one undo step. A patch that changes nothing leaves the state as it is. */
export function commit(state: EditorState, patch: Patch): EditorState {
  const { doc, inverse, changed } = applyPatch(state.doc, patch)
  if (!changed) return state
  const redo: Record<string, BoardElement | null> = {}
  for (const id of Object.keys(inverse)) redo[id] = patch[id]
  const undoStack = [...state.undoStack, { undo: inverse, redo }].slice(-HISTORY_LIMIT)
  return { doc, undoStack, redoStack: [] }
}

export function canUndo(state: EditorState): boolean {
  return state.undoStack.length > 0
}

export function canRedo(state: EditorState): boolean {
  return state.redoStack.length > 0
}

export function undo(state: EditorState): EditorState {
  const entry = state.undoStack[state.undoStack.length - 1]
  if (!entry) return state
  const { doc } = applyPatch(state.doc, entry.undo)
  return { doc, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, entry] }
}

export function redo(state: EditorState): EditorState {
  const entry = state.redoStack[state.redoStack.length - 1]
  if (!entry) return state
  const { doc } = applyPatch(state.doc, entry.redo)
  return { doc, undoStack: [...state.undoStack, entry], redoStack: state.redoStack.slice(0, -1) }
}

// ---------------------------------------------------------------------------
// What to save
// ---------------------------------------------------------------------------

/**
 * The elements whose version here is above the one the server holds: only these are sent. An element
 * created and deleted again before it was ever saved is not sent at all.
 */
export function changedWrites(doc: BoardDoc, saved: SavedVersions): ElementWrite[] {
  const writes: ElementWrite[] = []
  for (const [id, version] of Object.entries(doc.versions)) {
    const known = saved[id]
    if (known !== undefined && version <= known) continue
    const el = doc.elements[id]
    if (el) writes.push({ id, version, data: elementToData(el) })
    else if (known !== undefined) writes.push({ id, version, deleted: true })
  }
  return writes
}

export function hasUnsavedChanges(doc: BoardDoc, saved: SavedVersions): boolean {
  return changedWrites(doc, saved).length > 0
}

/** Splits the writes into requests of at most `size` elements. */
export function chunkWrites(writes: readonly ElementWrite[], size: number): ElementWrite[][] {
  const chunks: ElementWrite[][] = []
  for (let i = 0; i < writes.length; i += size) chunks.push(writes.slice(i, i + size))
  return chunks
}

/**
 * The saved versions after the server answered a write: what was sent is now held by the server, except
 * the stale ones, where the server keeps its own row (its version is recorded instead).
 */
export function acknowledge(saved: SavedVersions, sent: readonly ElementWrite[], stale: readonly StoredElement[]): SavedVersions {
  const next: Record<string, number> = { ...saved }
  for (const write of sent) next[write.id] = Math.max(next[write.id] ?? 0, write.version)
  for (const row of stale) next[row.id] = row.version
  return next
}

/**
 * A write request failed without an answer: the server may or may not have stored it. The sent elements
 * are remembered as "possibly there" (version 0), so deleting one of them later is still sent.
 */
export function markAttempted(saved: SavedVersions, sent: readonly ElementWrite[]): SavedVersions {
  const next: Record<string, number> = { ...saved }
  for (const write of sent) next[write.id] = next[write.id] ?? 0
  return next
}

/**
 * The server refused some writes as stale (someone else saved a newer version). The local content stays
 * and gets a version above the server's, so the next save carries it: the later save wins (plan §6).
 */
export function rebaseStale(doc: BoardDoc, stale: readonly StoredElement[]): BoardDoc {
  if (stale.length === 0) return doc
  const versions: Record<string, number> = { ...doc.versions }
  for (const row of stale) versions[row.id] = Math.max(versions[row.id] ?? 0, row.version + 1)
  return { elements: doc.elements, versions }
}

/**
 * Splits the writes into requests of at most `maxCount` elements and at most `maxBytes` of JSON, so a
 * request is never refused for its size. The size is an upper bound (3 bytes per UTF-16 unit); an element
 * above the budget on its own goes alone.
 */
export function batchWrites(
  writes: readonly ElementWrite[],
  maxCount: number,
  maxBytes: number,
  sizeOf: (write: ElementWrite) => number = (write) => JSON.stringify(write).length * 3,
): ElementWrite[][] {
  const batches: ElementWrite[][] = []
  let batch: ElementWrite[] = []
  let bytes = 0
  for (const write of writes) {
    const size = sizeOf(write)
    if (batch.length > 0 && (batch.length >= maxCount || bytes + size > maxBytes)) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(write)
    bytes += size
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { apiFetch } from "@/hooks"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import type { ReactionEmoji, ReactionSummary, ReactionTargetType } from "@/services/reactions/reactions.schemas"
import { applyToggle } from "./reaction-utils"

/**
 * Reactions of the visible comments / messages.
 *
 * One module-level cache shared by every bar on the page. Bars that appear in
 * the same moment ask the server with ONE request (batched per project and
 * target type), so a chat of 50 messages costs one GET, not 50. A "reaction"
 * real-time event for a target re-asks it; the cache survives navigation so a
 * bar shows its last answer at once and refreshes behind it.
 */

/** Wait this long to gather the bars that mount together into one request. */
export const BATCH_WINDOW_MS = 30
/** Server limit of ids per request (REACTION_QUERY_IDS_MAX). */
const BATCH_MAX = 200

const NONE: readonly ReactionSummary[] = Object.freeze([])
const cache = new Map<string, readonly ReactionSummary[]>()
const listeners = new Set<() => void>()
const queued = new Map<string, Set<string>>()
/** Clicks sent (or waiting to be sent) and not yet answered, per target. */
const unanswered = new Map<string, number>()
/** Last request of each target: clicks on one target go out one after the other. */
const sending = new Map<string, Promise<unknown>>()
let timer: ReturnType<typeof setTimeout> | undefined

const keyOf = (projectId: string, type: ReactionTargetType, id: string) => `${projectId}|${type}|${id}`
const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/reactions`

function emit() {
  for (const l of listeners) l()
}

function store(projectId: string, type: ReactionTargetType, id: string, reactions: readonly ReactionSummary[]) {
  cache.set(keyOf(projectId, type, id), reactions)
  emit()
}

async function fetchBatch(projectId: string, type: ReactionTargetType, ids: string[]) {
  const query = `targetType=${type}&ids=${ids.map(encodeURIComponent).join(",")}`
  const { reactions } = await apiFetch<{ reactions: Record<string, ReactionSummary[]> }>(`${base(projectId)}?${query}`)
  // A target with a click still in flight keeps its optimistic state: this answer
  // may predate the click, and the click's own answer will settle it.
  for (const id of ids) {
    const key = keyOf(projectId, type, id)
    if (!unanswered.has(key)) cache.set(key, reactions[id] ?? NONE)
  }
  emit()
}

function flush() {
  timer = undefined
  const groups = [...queued]
  queued.clear()
  for (const [group, idSet] of groups) {
    const [projectId, type] = group.split("|") as [string, ReactionTargetType]
    const ids = [...idSet]
    for (let i = 0; i < ids.length; i += BATCH_MAX) {
      // A failed refresh keeps what is shown; the next event / mount tries again.
      fetchBatch(projectId, type, ids.slice(i, i + BATCH_MAX)).catch(() => undefined)
    }
  }
}

/** Ask for (a refresh of) one target; calls in the same moment share a request. */
export function requestReactions(projectId: string, type: ReactionTargetType, id: string): void {
  const group = `${projectId}|${type}`
  queued.set(group, (queued.get(group) ?? new Set<string>()).add(id))
  timer ??= setTimeout(flush, BATCH_WINDOW_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test helper: forget everything. */
export function resetReactionCache(): void {
  cache.clear()
  queued.clear()
  unanswered.clear()
  sending.clear()
  clearTimeout(timer)
  timer = undefined
}

export interface UseReactions {
  reactions: readonly ReactionSummary[]
  /** Put / take back the viewer's reaction. Rejects when the server refuses (the list is rolled back first). */
  toggle: (emoji: ReactionEmoji) => Promise<void>
}

export function useReactions(projectId: string, type: ReactionTargetType, id: string): UseReactions {
  const key = keyOf(projectId, type, id)
  const reactions = useSyncExternalStore(
    subscribe,
    () => cache.get(key) ?? NONE,
    () => NONE,
  )

  useEffect(() => {
    requestReactions(projectId, type, id)
  }, [projectId, type, id])
  useLiveRefetch(() => requestReactions(projectId, type, id), { types: ["reaction"], projectId, entityTypes: [type], entityIds: id })

  const toggle = useCallback(
    (emoji: ReactionEmoji) => {
      const before = cache.get(key) ?? NONE
      store(projectId, type, id, applyToggle(before, emoji))
      unanswered.set(key, (unanswered.get(key) ?? 0) + 1)
      const send = async () => {
        try {
          const res = await apiFetch<{ active: boolean; reactions: ReactionSummary[] }>(base(projectId), {
            method: "POST",
            json: { targetType: type, targetId: id, emoji },
          })
          // Only the last answer is the truth; earlier ones would flicker the chip back.
          if (unanswered.get(key) === 1) store(projectId, type, id, res.reactions)
        } catch (err) {
          // Alone: undo exactly this click. With others queued: ask the server what is true.
          if (unanswered.get(key) === 1) store(projectId, type, id, before)
          else requestReactions(projectId, type, id)
          throw err
        } finally {
          const left = (unanswered.get(key) ?? 1) - 1
          if (left > 0) unanswered.set(key, left)
          else unanswered.delete(key)
        }
      }
      const run = (sending.get(key) ?? Promise.resolve()).then(send)
      sending.set(key, run.catch(() => undefined))
      return run
    },
    [key, projectId, type, id],
  )

  return { reactions, toggle }
}

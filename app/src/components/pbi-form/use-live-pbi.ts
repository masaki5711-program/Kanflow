"use client"

import { useCallback, useState } from "react"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import type { RealtimeSignal } from "@/components/realtime/realtime-hub"
import { useSignedInUserId } from "@/components/comments/use-comment-thread"

interface Options {
  projectId: string
  pbiId: string
  /** The edit form is open: never reload under it, only flag the change. */
  isEditing: boolean
  refetch: () => void
}

const LIVE_TYPES = ["activity"] as const
const PBI_ENTITY = ["pbi"] as const

/** Pure: did someone other than `selfId` change the PBI (a catch-up proves nothing)? */
export function changedByOthers(signals: readonly RealtimeSignal[], selfId: string | null): boolean {
  return signals.some((s) => s.type !== "resync" && s.actorId !== selfId)
}

/**
 * Live refresh of an open PBI detail: in read mode other people's changes
 * reload the PBI; in edit mode the user's unsaved input is left alone and
 * `remoteChanged` turns true (a small hint; saving then shows the regular
 * version-conflict comparison). `leaveEdit()` clears the hint and reloads
 * when a change was flagged.
 */
export function useLivePbi({ projectId, pbiId, isEditing, refetch }: Options) {
  const selfId = useSignedInUserId()
  const [remoteChanged, setRemoteChanged] = useState(false)

  useLiveRefetch(
    (signals) => {
      if (!isEditing) refetch()
      else if (changedByOthers(signals, selfId)) setRemoteChanged(true)
    },
    { types: LIVE_TYPES, projectId, entityTypes: PBI_ENTITY, entityIds: pbiId },
  )

  const leaveEdit = useCallback(() => {
    if (remoteChanged) refetch()
    setRemoteChanged(false)
  }, [remoteChanged, refetch])

  return { remoteChanged: isEditing && remoteChanged, leaveEdit }
}

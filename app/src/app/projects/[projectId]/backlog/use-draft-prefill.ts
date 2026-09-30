"use client"

import { useEffect, useRef } from "react"
/** PBI fields an IceBox AI draft pre-fills. */
export interface DraftFields {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: number
  iceboxItemId: string
}

function readDraft(raw: string): DraftFields | null {
  try {
    const d = JSON.parse(raw) as Partial<Record<keyof DraftFields, unknown>>
    const str = (v: unknown) => (typeof v === "string" ? v : "")
    return {
      initiative: str(d.initiative),
      epic: str(d.epic),
      userStory: str(d.userStory),
      acceptanceCriteria: str(d.acceptanceCriteria),
      workloadScore: typeof d.workloadScore === "number" ? d.workloadScore : 0,
      iceboxItemId: str(d.iceboxItemId),
    }
  } catch {
    return null
  }
}

/**
 * Consumes a PBI draft handed over from the IceBox page (sessionStorage +
 * `?fromAiDraft=1`) exactly once, then cleans the URL.
 */
export function useDraftPrefill(projectId: string, onDraft: (draft: DraftFields) => void): void {
  const onDraftRef = useRef(onDraft)
  useEffect(() => {
    onDraftRef.current = onDraft
  })

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("fromAiDraft")) return
    const key = `kanflow:pbiDraft:${projectId}`
    const raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    const url = new URL(window.location.href)
    url.searchParams.delete("fromAiDraft")
    window.history.replaceState({}, "", url.toString())
    const draft = raw ? readDraft(raw) : null
    if (draft) onDraftRef.current(draft)
  }, [projectId])
}

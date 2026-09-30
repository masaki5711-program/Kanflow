"use client"

import { useState } from "react"
import { useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { messageOf } from "../lib/errors"

export interface PbiFullDetail {
  id: string
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  referenceDoc: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  poNote: string | null
}

const EDITABLE_KEYS = [
  "initiative", "epic", "userStory", "acceptanceCriteria", "referenceDoc",
  "workloadScore", "status", "assignedPo", "poNote",
] as const

interface Edits {
  id: string
  patch: Partial<PbiFullDetail>
}

/**
 * Full PBI record for the task modal, with local (unsaved) edits layered on
 * top. Edits are keyed by PBI id, so switching the selected PBI discards them
 * without an effect.
 */
export function usePbiDetail(projectId: string, pbItemId: string, canEdit: boolean, onSaved?: () => void) {
  const { t } = useLanguage()
  const toast = useToast()
  const { data, isLoading, mutate } = useApiQuery<PbiFullDetail>(
    pbItemId ? `/api/projects/${projectId}/backlog/${pbItemId}` : null,
    { toastOnError: true },
  )
  const [edits, setEdits] = useState<Edits | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const patch = data && edits?.id === data.id ? edits.patch : {}
  const detail: PbiFullDetail | null = data && data.id === pbItemId ? { ...data, ...patch } : null
  const isDirty = detail !== null && Object.keys(patch).length > 0

  function update(next: Partial<PbiFullDetail>) {
    if (!data) return
    setEdits((prev) => ({ id: data.id, patch: { ...(prev?.id === data.id ? prev.patch : {}), ...next } }))
  }

  /** Persist pending edits. Resolves true when there was nothing to save or the save succeeded. */
  async function saveIfDirty(): Promise<boolean> {
    if (!detail || !isDirty || !canEdit) return true
    setIsSaving(true)
    try {
      const json = Object.fromEntries(EDITABLE_KEYS.map((k) => [k, detail[k]]))
      await apiFetch(`/api/projects/${projectId}/backlog/${detail.id}`, { method: "PATCH", json })
      mutate(detail)
      setEdits(null)
      onSaved?.()
      return true
    } catch (err) {
      toast.error(messageOf(err, t.error), { title: t.sprintTaskPbiSaveFailed })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  return { detail, isLoading, isDirty, isSaving, update, saveIfDirty }
}

export type PbiDetailState = ReturnType<typeof usePbiDetail>

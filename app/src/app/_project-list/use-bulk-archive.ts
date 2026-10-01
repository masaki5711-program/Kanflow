"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { runSequential, type BulkResult } from "./bulk-archive"
import type { Project } from "./types"
import type { ProjectStatus } from "./use-project-archive"

interface Options {
  /** Move a project between the active / archived lists once the server accepted it. */
  markStatus: (id: string, status: ProjectStatus) => void
  /** After a batch changed anything (e.g. refetch the archived list if it is loaded). */
  onChanged?: () => void
}

export interface BulkProgress {
  done: number
  total: number
}

function fill(template: string, values: Record<string, number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

function patchStatus(id: string, status: ProjectStatus) {
  // Same endpoint, authz ("project.update") and activity log as the single archive.
  return apiFetch(`/api/projects/${id}`, { method: "PATCH", json: { status } })
}

/**
 * Archive many projects one by one (progress, partial failures) and offer
 * "Undo" in the toast, which restores every project archived by that batch.
 */
export function useBulkArchive({ markStatus, onChanged }: Options) {
  const router = useRouter()
  const toast = useToast()
  const { t } = useLanguage()
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [result, setResult] = useState<BulkResult<Project> | null>(null)

  function finish(changed: number) {
    if (changed === 0) return
    router.refresh()
    onChanged?.()
  }

  async function undo(batch: readonly Project[]): Promise<BulkResult<Project>> {
    const res = await runSequential(batch, async (p) => {
      await patchStatus(p.id, "active")
      markStatus(p.id, "active")
    })
    finish(res.succeeded.length)
    if (res.failed.length > 0) toast.error(fill(t.projectBulkArchiveUndoFailed, { count: res.failed.length }))
    if (res.succeeded.length > 0) toast.success(fill(t.projectBulkArchiveUndone, { count: res.succeeded.length }))
    return res
  }

  async function archiveAll(projects: readonly Project[]): Promise<BulkResult<Project>> {
    setResult(null)
    setProgress({ done: 0, total: projects.length })
    const res = await runSequential(
      projects,
      async (p) => {
        await patchStatus(p.id, "archived")
        markStatus(p.id, "archived")
      },
      (done, total) => setProgress({ done, total }),
    )
    setProgress(null)
    setResult(res)
    finish(res.succeeded.length)
    const ok = res.succeeded.length
    if (ok > 0) {
      const message =
        res.failed.length > 0
          ? fill(t.projectBulkArchivePartial, { ok, failed: res.failed.length })
          : fill(t.projectBulkArchiveDone, { count: ok })
      toast.success(message, { action: { label: t.projectArchiveUndo, onClick: () => void undo(res.succeeded) } })
    } else if (res.failed.length > 0) {
      toast.error(fill(t.projectBulkArchivePartial, { ok: 0, failed: res.failed.length }))
    }
    return res
  }

  function reset() {
    setResult(null)
    setProgress(null)
  }

  return { archiveAll, undo, progress, result, isRunning: progress !== null, reset }
}

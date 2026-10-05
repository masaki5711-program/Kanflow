"use client"

import { useMemo, useState } from "react"
import { useParams, usePathname, useSearchParams } from "next/navigation"
import { Plus, Trophy } from "lucide-react"
import { Button, EmptyState, PageHeader, SkeletonCard, useConfirm, useToast } from "@/components/ui"
import { ExcelExportButton } from "@/components/excel/excel-export-button"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { apiFetch } from "@/hooks"
import { improvementsUrl } from "@/lib/improvement/constants"
import { useLanguage } from "@/lib/language-context"
import { ImportDialog } from "../import-dialog"
import { DetailDialog } from "./detail-dialog"
import { StageBoard } from "./stage-board"
import { SummaryStrip } from "./summary-strip"
import { useImprovementBoard } from "./use-improvement-board"

const ITEM_PARAM = "item"
const NO_PERMISSIONS = { canManage: false, canTrack: false }

/**
 * /releases of a process_improvement project: the 改善成果ボード. Summary
 * strip, stage columns and the detail dialog (`?item=<id>` deep link, used by
 * the 定着確認 reminder notification). Import from the 改善バックログ reuses
 * the release import dialog.
 */
export function ImprovementBoardPage() {
  const projectId = useParams().projectId as string
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { t, pt } = useLanguage()
  useProjectDocumentTitle(t.kzBoardTitle)
  const confirm = useConfirm()
  const toast = useToast()
  const board = useImprovementBoard(projectId)
  const { items, data, isLoading, refetch, write } = board
  const permissions = data?.permissions ?? NO_PERMISSIONS
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const selectedId = searchParams.get(ITEM_PARAM)
  const selected = items.find((i) => i.id === selectedId) ?? null
  const existingPbIds = useMemo(() => new Set(items.map((i) => i.pbItemId).filter((id): id is string => Boolean(id))), [items])

  function openItem(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set(ITEM_PARAM, id)
    else params.delete(ITEM_PARAM)
    const query = params.toString()
    // Native history: Next.js syncs useSearchParams without a navigation (same as the backlog's ?pbi=).
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
  }

  async function handleImport(pbItemIds: string[], planVersion: string): Promise<boolean> {
    setImporting(true)
    try {
      await apiFetch(`/api/projects/${projectId}/releases/import`, { method: "POST", json: { pbItemIds, planVersion: planVersion || undefined } })
      toast.success(t.releaseImported.replace("{count}", String(pbItemIds.length)))
      refetch()
      return true
    } catch {
      toast.error(t.releaseImportFailed)
      return false
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ message: t.releaseDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    const result = await write(id, "", { method: "DELETE" })
    if (result.ok) openItem(null)
    else toast.error(result.message)
  }

  return (
    <div>
      <PageHeader
        title={t.kzBoardTitle}
        description={t.kzBoardDesc}
        icon={<Trophy className="h-6 w-6" />}
        actions={
          <>
            <ExcelExportButton href={`${improvementsUrl(projectId)}/export`} title={t.kzExportTitle} iconOnlyOnPhone />
            {permissions.canManage && (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowImport(true)}>
                {pt.releaseImportTitle}
              </Button>
            )}
          </>
        }
      />
      {!data && board.error ? (
        <EmptyState icon={<Trophy className="h-8 w-8" />} title={t.releaseLoadFailed} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : (
        <>
          <SummaryStrip summary={data.summary} />
          {items.length === 0 ? (
            <EmptyState icon={<Trophy className="h-8 w-8" />} title={t.kzEmptyTitle} description={t.kzEmptyDesc} />
          ) : (
            <StageBoard projectId={projectId} items={items} onOpen={openItem} />
          )}
        </>
      )}
      <ImportDialog projectId={projectId} open={showImport} existingPbIds={existingPbIds} importing={importing} onClose={() => setShowImport(false)} onImport={handleImport} />
      <DetailDialog
        projectId={projectId}
        item={selected}
        permissions={permissions}
        rolloutNames={data?.rolloutNames ?? []}
        write={write}
        onClose={() => openItem(null)}
        onDelete={(id) => void handleDelete(id)}
      />
    </div>
  )
}

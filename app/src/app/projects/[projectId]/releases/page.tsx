"use client"

import { Suspense, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, SkeletonCard, useConfirm, useToast, PageHeader } from "@/components/ui"
import { UNCATEGORIZED, groupByVersion, type ReleaseEditForm, type ReleaseItem } from "./release-types"
import { useReleases } from "./use-releases"
import { useReleaseGit } from "./use-release-git"
import { ChevronIcon, VersionGroup } from "./version-group"
import { ImportDialog } from "./import-dialog"
import { EditDialog } from "./edit-dialog"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { ImprovementBoardPage } from "./improvement/improvement-board-page"
import { MilestoneBoardPage } from "./milestones/milestone-board-page"

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
        clipRule="evenodd"
      />
    </svg>
  )
}

/**
 * process_improvement projects get the 改善成果ボード (releases/improvement/**),
 * general projects the マイルストーン・検収ボード (releases/milestones/**);
 * software projects keep the release backlog below, unchanged.
 */
export default function ReleasesPage() {
  const { projectType } = useLanguage()
  if (projectType !== "general" && projectType !== "process_improvement") return <SoftwareReleasesPage />
  // The boards read ?item= / ?stage= (useSearchParams needs a Suspense boundary above it).
  return <Suspense fallback={<SkeletonCard />}>{projectType === "general" ? <MilestoneBoardPage /> : <ImprovementBoardPage />}</Suspense>
}

function SoftwareReleasesPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt } = useLanguage()
  useProjectDocumentTitle(pt.releaseTitle)
  const confirm = useConfirm()
  const { items, isLoading, save, remove, importItems, bulkRelease, refetch } = useReleases(projectId)
  const gitStatus = useReleaseGit(projectId)
  const [markingVersion, setMarkingVersion] = useState<string | null>(null)
  const toast = useToast()

  const [showImport, setShowImport] = useState(false)
  const [editingItem, setEditingItem] = useState<ReleaseItem | null>(null)
  const [showReleased, setShowReleased] = useState(false)
  const [collapsedVersions, setCollapsedVersions] = useState<ReadonlySet<string>>(new Set())

  const activeGroups = useMemo(() => groupByVersion(items.filter((i) => i.status !== "released")), [items])
  const releasedItems = useMemo(() => items.filter((i) => i.status === "released"), [items])
  const releasedGroups = useMemo(() => groupByVersion(releasedItems), [releasedItems])
  const existingPbIds = useMemo(
    () => new Set(items.map((ri) => ri.pbItemId).filter((id): id is string => Boolean(id))),
    [items],
  )

  function toggleVersionCollapse(version: string) {
    setCollapsedVersions((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  async function handleImport(pbItemIds: string[], planVersion: string): Promise<boolean> {
    try {
      await importItems.mutateAsync({ pbItemIds, planVersion })
      return true
    } catch {
      return false
    }
  }

  async function handleSave(id: string, form: ReleaseEditForm): Promise<boolean> {
    try {
      await save.mutateAsync({ id, form })
      return true
    } catch {
      return false
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      message: t.releaseDeleteConfirm,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (!ok) return
    try {
      await remove.mutateAsync(id)
      setEditingItem(null)
    } catch {
      // toast + rollback handled by the mutation
    }
  }

  async function handleBulkRelease(version: string) {
    const count = items.filter(
      (i) => (i.planVersion ?? UNCATEGORIZED) === version && i.status !== "released",
    ).length
    if (count === 0) return
    const pending = gitStatus.byVersion.get(version)?.pending.length ?? 0
    const warn = pending > 0 ? `
${t.releaseGitPendingWarn.replace("{n}", String(pending))}` : ""
    const ok = await confirm({
      message: `${count} ${t.releaseBulkConfirm}${warn}`,
      confirmLabel: t.confirm,
      cancelLabel: t.cancel,
      variant: "warning",
    })
    if (ok) await bulkRelease(version)
  }

  async function handleMarkReleased(version: string) {
    const git = gitStatus.byVersion.get(version)
    if (!git?.tag) return
    const open = items.filter((i) => i.planVersion === version && (i.status === "staged" || i.status === "ready")).length
    const warn = git.pending.length > 0 ? `
${t.releaseGitPendingWarn.replace("{n}", String(git.pending.length))}` : ""
    const ok = await confirm({
      message: `${t.releaseGitMarkConfirm.replace("{n}", String(open))}${warn}`,
      confirmLabel: t.confirm,
      cancelLabel: t.cancel,
      variant: "warning",
    })
    if (!ok) return
    setMarkingVersion(version)
    try {
      const updated = await gitStatus.markReleased(version)
      toast.success(t.releaseBulkDone.replace("{count}", String(updated)))
      refetch()
    } catch {
      toast.error(t.releaseSaveFailed)
    } finally {
      setMarkingVersion(null)
    }
  }

  const renderGroup = ([version, groupItems]: [string, ReleaseItem[]], isReleased: boolean) => (
    <VersionGroup
      key={version}
      version={version}
      items={groupItems}
      isReleased={isReleased}
      isCollapsed={collapsedVersions.has(version)}
      onToggle={toggleVersionCollapse}
      onBulkRelease={handleBulkRelease}
      onEdit={setEditingItem}
      git={gitStatus.byVersion.get(version)}
      projectId={projectId}
      onMarkReleased={handleMarkReleased}
      marking={markingVersion === version}
    />
  )

  return (
    <div>
      <PageHeader
        title={pt.releaseTitle}
        actions={
          <Button leftIcon={<PlusIcon />} onClick={() => setShowImport(true)}>
            {pt.releaseImportTitle}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {items.length === 0 && (
              <EmptyState icon={<UploadIcon />} title={t.releaseNoItems} description={t.releaseNoItemsDesc} />
            )}
            {activeGroups.map((g) => renderGroup(g, false))}
          </div>

          {releasedItems.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setShowReleased((v) => !v)}
                aria-expanded={showReleased}
                className="flex items-center gap-2 rounded-ui-sm text-body text-fg-muted transition-colors hover:text-fg"
              >
                <ChevronIcon open={showReleased} />
                {pt.releaseReleasedSection} ({releasedItems.length})
              </button>
              {showReleased && (
                <div className="mt-4 space-y-4">{releasedGroups.map((g) => renderGroup(g, true))}</div>
              )}
            </div>
          )}
        </>
      )}

      <ImportDialog
        projectId={projectId}
        open={showImport}
        existingPbIds={existingPbIds}
        importing={importItems.isPending}
        onClose={() => setShowImport(false)}
        onImport={handleImport}
      />

      <EditDialog
        item={editingItem}
        saving={save.isPending}
        deleting={remove.isPending}
        onClose={() => setEditingItem(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}

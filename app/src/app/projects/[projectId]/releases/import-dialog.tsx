"use client"

import { useMemo, useState } from "react"
import { Button, EmptyState, Field, Input, Modal, SkeletonLines, Truncate, useModalClose } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { BacklogListResponse } from "@/types/api"
import { pbiText, type CompletedPbi } from "./release-types"

interface ImportDialogProps {
  projectId: string
  open: boolean
  /** PBI ids that already have a release item (hidden from the list). */
  existingPbIds: ReadonlySet<string>
  importing: boolean
  onClose: () => void
  /** Resolves true when the import succeeded (the dialog then closes). */
  onImport: (pbItemIds: string[], planVersion: string) => Promise<boolean>
}

type BacklogResponse = Pick<BacklogListResponse<CompletedPbi>, "completedItems">

/** Mounted only while open, so the selection and version reset every time. */
export function ImportDialog(props: ImportDialogProps) {
  if (!props.open) return null
  return <ImportDialogBody {...props} />
}

function ImportDialogBody({ projectId, existingPbIds, importing, onClose, onImport }: ImportDialogProps) {
  const { t, pt, language } = useLanguage()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [version, setVersion] = useState("")

  const { data, isLoading } = useApiQuery<BacklogResponse>(`/api/projects/${projectId}/backlog`, {
    toastOnError: () => t.releaseLoadCompletedFailed,
  })
  const candidates = useMemo(
    () => (data?.completedItems ?? []).filter((p) => !existingPbIds.has(p.id)),
    [data, existingPbIds],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (selected.size === 0) return
    if (await onImport(Array.from(selected), version)) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={pt.releaseImportTitle}
      size="lg"
      isDirty={selected.size > 0 || version !== ""}
      footer={
        <ImportFooter
          label={`${pt.releaseImportButton} (${selected.size}${t.items})`}
          disabled={selected.size === 0}
          loading={importing}
          onSubmit={submit}
        />
      }
    >
      <div className="space-y-4">
        <Field label={pt.releaseVersion}>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.0.0" />
        </Field>
        {isLoading ? (
          <SkeletonLines lines={4} label={t.loading} />
        ) : candidates.length === 0 ? (
          <EmptyState compact title={t.releaseNoCompletedItems} />
        ) : (
          <ul className="space-y-1">
            {candidates.map((pb) => (
              <li key={pb.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-ui-sm p-3 transition-colors hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={selected.has(pb.id)}
                    onChange={() => toggle(pb.id)}
                    className="h-4 w-4 rounded border-border-strong"
                  />
                  <span className="font-mono text-caption text-fg-muted">#{pb.displayId}</span>
                  <Truncate text={pbiText(pb, language)} lines={1} className="min-w-0 flex-1 text-body text-fg" />
                  <span className="text-caption text-fg-muted">{pb.workloadScore}pt</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

interface ImportFooterProps {
  label: string
  disabled: boolean
  loading: boolean
  onSubmit: () => void
}

function ImportFooter({ label, disabled, loading, onSubmit }: ImportFooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>
        {t.cancel}
      </Button>
      <Button onClick={onSubmit} disabled={disabled} loading={loading}>
        {label}
      </Button>
    </>
  )
}

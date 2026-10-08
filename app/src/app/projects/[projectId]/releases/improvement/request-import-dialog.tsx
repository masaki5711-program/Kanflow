"use client"

import { useMemo, useState } from "react"
import { Button, EmptyState, Modal, SkeletonLines, Truncate, useModalClose } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { IceboxItemDto } from "@/types/api"

interface IceboxList {
  unreviewed: IceboxItemDto[]
  reviewed: IceboxItemDto[]
  completed: IceboxItemDto[]
  frozen: IceboxItemDto[]
}

interface Props {
  projectId: string
  open: boolean
  /** 改善要望 ids already on the board (hidden from the list). */
  existingIds: ReadonlySet<string>
  importing: boolean
  onClose: () => void
  /** Resolves true when the import succeeded (the dialog then closes). */
  onImport: (iceboxIds: string[]) => Promise<boolean>
}

/** Mounted only while open, so the selection resets every time. */
export function RequestImportDialog(props: Props) {
  if (!props.open) return null
  return <RequestBody {...props} />
}

function RequestBody({ projectId, existingIds, importing, onClose, onImport }: Props) {
  const { t, language } = useLanguage()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { data, isLoading } = useApiQuery<IceboxList>(`/api/projects/${projectId}/icebox`, {
    toastOnError: () => t.kzRequestsLoadFailed,
  })
  const candidates = useMemo(
    () => [...(data?.unreviewed ?? []), ...(data?.reviewed ?? []), ...(data?.completed ?? [])].filter((i) => !existingIds.has(i.id)),
    [data, existingIds],
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
    if (await onImport(Array.from(selected))) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.kzImportRequestsTitle}
      size="lg"
      isDirty={selected.size > 0}
      footer={<RequestFooter label={`${t.kzImportRequestsSubmit} (${selected.size}${t.items})`} disabled={selected.size === 0} loading={importing} onSubmit={submit} />}
    >
      {isLoading ? (
        <SkeletonLines lines={4} label={t.loading} />
      ) : candidates.length === 0 ? (
        <EmptyState compact title={t.kzNoRequests} />
      ) : (
        <ul className="space-y-1">
          {candidates.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-ui-sm p-3 transition-colors hover:bg-surface-muted">
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="h-4 w-4 rounded border-border-strong" />
                <span className="font-mono text-caption text-fg-muted">#{item.displayId}</span>
                <Truncate text={pickText(item.i18n, "request", item.request, language).text} lines={1} className="min-w-0 flex-1 text-body text-fg" />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function RequestFooter({ label, disabled, loading, onSubmit }: { label: string; disabled: boolean; loading: boolean; onSubmit: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      <Button variant="secondary" onClick={close}>{t.cancel}</Button>
      <Button onClick={onSubmit} disabled={disabled} loading={loading}>{label}</Button>
    </>
  )
}

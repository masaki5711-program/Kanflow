"use client"

import { useCallback, useEffect, useState } from "react"
import { Button, Modal, useModalClose } from "@/components/ui"
import type { KaizenStage } from "@/lib/improvement/constants"
import { stageLabel } from "@/lib/improvement/labels"
import { useLanguage } from "@/lib/language-context"
import { releaseItemText } from "../release-types"
import { CheckSection } from "./check-section"
import { EffectSection } from "./effect-section"
import { invalidNumberFields, toForm, toPatch, type BoardPermissions, type ImprovementForm, type ImprovementItem } from "./improvement-types"
import { PhotoSection } from "./photo-section"
import { RolloutSection } from "./rollout-section"
import type { Announce } from "./section-frame"
import { MemoSection, StandardSection } from "./standard-section"
import { StageSection } from "./stage-section"
import type { BoardWriter } from "./use-improvement-board"

interface Props {
  projectId: string
  item: ImprovementItem | null
  permissions: BoardPermissions
  rolloutNames: readonly string[]
  write: BoardWriter
  onClose: () => void
  onDelete: (id: string) => void
}

/** Mounted per item (keyed by id) so the form starts from the item's saved values. */
export function DetailDialog(props: Props) {
  if (!props.item) return null
  return <DetailBody key={props.item.id} {...props} item={props.item} />
}

interface Status {
  message: string
  tone: "success" | "error"
}

/** A success message fades after this long (errors stay until the next action). */
const SUCCESS_VISIBLE_MS = 4000

/**
 * Sections: 段階, 効果, 写真, 標準化, 横展開, 定着確認, メモ. Scalar fields (効果,
 * 標準化, 展開日, メモ) are saved with the footer button; photos, rollout
 * status, check results and the stage are saved at once. Every outcome is
 * announced in one aria-live region.
 */
function DetailBody({ projectId, item, permissions, rolloutNames, write, onClose, onDelete }: Props & { item: ImprovementItem }) {
  const { t, language } = useLanguage()
  const [initial, setInitial] = useState<ImprovementForm>(() => toForm(item))
  const [form, setForm] = useState<ImprovementForm>(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  // Follow the server copy after a refetch (e.g. the 標準化日 it filled in) while nothing is being edited.
  const serverForm = toForm(item)
  const [syncedKey, setSyncedKey] = useState(() => JSON.stringify(serverForm))
  if (syncedKey !== JSON.stringify(serverForm)) {
    setSyncedKey(JSON.stringify(serverForm))
    if (!isDirty) {
      setInitial(serverForm)
      setForm(serverForm)
    }
  }
  const invalid = invalidNumberFields(form)
  const { canManage, canTrack } = permissions

  const announce: Announce = useCallback((message, tone = "success") => setStatus({ message, tone }), [])
  useEffect(() => {
    if (status?.tone !== "success") return
    const timer = setTimeout(() => setStatus(null), SUCCESS_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [status])
  const onChange = useCallback(<K extends keyof ImprovementForm>(key: K, value: ImprovementForm[K]) => setForm((prev) => ({ ...prev, [key]: value })), [])

  /** PATCH the form (and optionally a new stage); the form becomes the new saved baseline. */
  async function save(extra: { kaizenStage?: KaizenStage } = {}): Promise<void> {
    if (saving || invalid.length > 0) return
    setSaving(true)
    const result = await write(item.id, "", { method: "PATCH", json: { ...toPatch(form, initial), ...extra } })
    setSaving(false)
    if (!result.ok) return announce(result.message, "error")
    setInitial(form)
    announce(extra.kaizenStage ? t.kzStageChanged.replace("{stage}", stageLabel(extra.kaizenStage, t)) : t.kzSaved)
  }

  const title = releaseItemText(item, language, t.sprintNotEntered)
  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={title}
      description={item.pbItem ? `${t.kzDialogTitle} · PBI #${item.pbItem.displayId}` : t.kzDialogTitle}
      isDirty={isDirty}
      footer={<Footer canManage={canManage} canSave={isDirty && invalid.length === 0} saving={saving} onSave={() => void save()} onDelete={() => onDelete(item.id)} />}
      bodyClassName="space-y-3 bg-surface-muted"
    >
      {!canManage && <p className="rounded-ui-md bg-info-soft px-3 py-2 text-caption text-info">{t.kzReadOnly}</p>}
      <StageSection
        stage={item.kaizenStage}
        hasStandardLink={form.manualLink.trim() !== ""}
        hasSustainedCheck={item.checks.some((c) => c.result === "sustained")}
        canManage={canManage}
        saving={saving}
        onSelect={(kaizenStage) => void save({ kaizenStage })}
      />
      <EffectSection form={form} readOnly={!canManage} onChange={onChange} />
      <PhotoSection projectId={projectId} item={item} canEdit={canTrack} write={write} announce={announce} />
      <StandardSection form={form} readOnly={!canManage} onChange={onChange} />
      <RolloutSection item={item} canManage={canManage} canTrack={canTrack} suggestions={rolloutNames} write={write} announce={announce} />
      <CheckSection item={item} form={form} canManage={canManage} canTrack={canTrack} onChange={onChange} write={write} announce={announce} />
      <MemoSection form={form} readOnly={!canManage} onChange={onChange} />
      <p
        aria-live="polite"
        aria-atomic="true"
        className={status ? `sticky bottom-0 rounded-ui-md px-3 py-2 text-body font-medium shadow-ui-md ${status.tone === "error" ? "bg-danger-soft text-danger-strong" : "bg-success-soft text-success-strong"}` : "sr-only"}
      >
        {status?.message ?? ""}
      </p>
    </Modal>
  )
}

interface FooterProps {
  canManage: boolean
  canSave: boolean
  saving: boolean
  onSave: () => void
  onDelete: () => void
}

function Footer({ canManage, canSave, saving, onSave, onDelete }: FooterProps) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      {canManage ? (
        <Button variant="danger" onClick={onDelete}>
          {t.kzDelete}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={close}>
          {canManage ? t.cancel : t.close}
        </Button>
        {canManage && (
          <Button onClick={onSave} loading={saving} disabled={!canSave}>
            {t.save}
          </Button>
        )}
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Button, Modal, useModalClose, useToast } from "@/components/ui"
import { lostEdits, reapplyEdits } from "@/hooks/version-conflict"
import { useLanguage } from "@/lib/language-context"
import {
  buildCreateInput,
  buildPatch,
  derivedFlags,
  formFromDraft,
  formFromItem,
  isSameForm,
  validateForm,
  type FormErrorKey,
  type PlanForm,
} from "../lib/plan-form"
import type { PlanDependency, PlanDraft, PlanItem, PlanItemInput, PlanItemPatch } from "../lib/plan-types"
import { diffDays, isYmd } from "../lib/date"
import { descendantIds } from "../lib/tree"
import { usePlanLinks } from "../hooks/use-plan-links"
import { PlanConflictNotice, type PlanLostEdit } from "./plan-conflict-notice"
import { PlanDependencySection } from "./plan-dependency-section"
import { PlanEditFields } from "./plan-edit-fields"
import { PlanLinkSection } from "./plan-link-section"
import { PlanShiftDialog } from "./plan-shift-dialog"

export type EditorTarget = { kind: "edit"; item: PlanItem; focusLinks?: boolean } | { kind: "draft"; draft: PlanDraft }

interface Props {
  target: EditorTarget
  apiBase: string
  /** Backlog page URL; `?plan=<id>` is appended for the linked-PBI view. */
  backlogPath: string
  items: readonly PlanItem[]
  dependencies: readonly PlanDependency[]
  members: readonly { id: string; name: string }[]
  readOnly: boolean
  /** The API's "today" (anchor of the date short-hand). */
  today: string
  nameOf: (item: PlanItem) => string
  onClose: () => void
  onCreate: (input: PlanItemInput) => Promise<boolean>
  /** PATCH; `onConflict` receives the server's copy on a 409 (the form reloads from it). */
  onSave: (item: PlanItem, patch: PlanItemPatch, onConflict: (current: PlanItem | null) => void) => Promise<boolean>
  /** Confirms and deletes; resolves true when the item was removed. */
  onDelete: (item: PlanItem) => Promise<boolean>
  onRemoveDependency: (id: string) => void
  onLinksSaved: () => void
  /** The following plan was moved by the actual-vs-plan correction (reload the plan). */
  onShifted: () => void
}

const FORM_ID = "plan-item-form"

function patchTouchesActuals(patch: PlanItemPatch): boolean {
  return "actualStart" in patch || "actualEnd" in patch
}

/** Days the actuals are off the plan (finished: end vs end; running: start vs start); null = nothing to correct. */
function actualSlip(form: { plannedStart: string; plannedEnd: string; actualStart: string; actualEnd: string }): number | null {
  const slip =
    isYmd(form.actualEnd) && isYmd(form.plannedEnd)
      ? diffDays(form.plannedEnd, form.actualEnd)
      : isYmd(form.actualStart) && isYmd(form.plannedStart)
        ? diffDays(form.plannedStart, form.actualStart)
        : 0
  return slip === 0 ? null : slip
}

/** Days the saved patch moved the planned end (null = not moved / not a dated item). */
function plannedEndMove(item: PlanItem, patch: PlanItemPatch): number | null {
  if (!item.plannedEnd || !patch.plannedEnd || !isYmd(patch.plannedEnd)) return null
  const days = diffDays(item.plannedEnd, patch.plannedEnd)
  return days === 0 ? null : days
}

function Footer({ saving, readOnly, onDelete }: { saving: boolean; readOnly: boolean; onDelete?: () => void }) {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <>
      {onDelete && (
        <Button variant="ghost" className="mr-auto text-danger hover:text-danger-hover" onClick={onDelete}>
          {t.delete}
        </Button>
      )}
      <Button variant="secondary" onClick={close}>{readOnly ? t.close : t.cancel}</Button>
      {!readOnly && <Button type="submit" form={FORM_ID} loading={saving}>{t.save}</Button>}
    </>
  )
}

/** The newer of the loaded item and the copy a 409 returned. */
function pickBase(loaded: PlanItem | null, fromConflict: PlanItem | null): PlanItem | null {
  if (!loaded || !fromConflict || fromConflict.id !== loaded.id) return loaded
  return (fromConflict.version ?? 0) > (loaded.version ?? 0) ? fromConflict : loaded
}

/** Parent choices: every item except the edited one, its subtree and milestones, in tree order. */
function parentChoices(items: readonly PlanItem[], selfId: string | null, nameOf: (i: PlanItem) => string) {
  const excluded = new Set(selfId ? [selfId, ...descendantIds(items, selfId)] : [])
  const byParent = new Map<string | null, PlanItem[]>()
  for (const it of items) byParent.set(it.parentId, [...(byParent.get(it.parentId) ?? []), it])
  const out: { id: string; name: string; depth: number }[] = []
  const walk = (pid: string | null, depth: number) => {
    for (const it of (byParent.get(pid) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (excluded.has(it.id)) continue
      if (!it.isMilestone) out.push({ id: it.id, name: nameOf(it), depth })
      walk(it.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/**
 * Editor of a plan item. A draft (new item) is only POSTed on Save. Derived
 * values (summary rows; progress/status of PBI-linked leaves) are shown
 * read-only. Leaves can link PBIs; dependencies can be removed here.
 */
export default function PlanEditModal(props: Props) {
  const { target, readOnly, nameOf } = props
  const { t } = useLanguage()
  const toast = useToast()
  const loaded = target.kind === "edit" ? target.item : null
  // After a 409 the server's copy (newer version) is the base of the next save.
  const [conflictItem, setConflictItem] = useState<PlanItem | null>(null)
  const item = pickBase(loaded, conflictItem)
  const [initial, setInitial] = useState<PlanForm>(() => (loaded ? formFromItem(loaded) : formFromDraft((target as { draft: PlanDraft }).draft)))
  const [form, setForm] = useState<PlanForm>(initial)
  const [errors, setErrors] = useState<Partial<Record<FormErrorKey, true>>>({})
  const [saving, setSaving] = useState(false)
  const [shiftSlip, setShiftSlip] = useState<number | null>(null)
  // Days the planned end moved by this save (the followers can be moved by the same number).
  const [endMove, setEndMove] = useState<number | null>(null)
  // After a 409: the edits the reload replaced (shown with a "restore my input" action).
  const [lost, setLost] = useState<readonly PlanLostEdit[] | null>(null)
  // A 409 without a body copy: reload the form once the refetched item (new version) arrives.
  const [reloadAfter, setReloadAfter] = useState<number | null>(null)
  const canLink = !!item && !item.hasChildren && !form.isMilestone
  const links = usePlanLinks(props.apiBase, item?.id ?? null, canLink)
  const linkedCount = canLink && !links.isLoading ? links.selectedIds.length : (item?.linked?.pbiCount ?? 0)
  const flags = derivedFlags(item, form, linkedCount)
  const isDirty = !readOnly && (!isSameForm(form, initial) || links.isDirty)
  const byId = useMemo(() => new Map(props.items.map((i) => [i.id, i])), [props.items])
  const parents = useMemo(() => parentChoices(props.items, item?.id ?? null, nameOf), [props.items, item?.id, nameOf])

  const reloadForm = useCallback((fresh: PlanItem) => {
    const next = formFromItem(fresh)
    setInitial(next)
    setForm(next)
    setErrors({})
  }, [])

  useEffect(() => {
    if (reloadAfter === null || !loaded || (loaded.version ?? 0) <= reloadAfter) return
    setReloadAfter(null)
    reloadForm(loaded)
  }, [loaded, reloadAfter, reloadForm])

  const onConflict = (current: PlanItem | null) => {
    // Unknown latest (refetching): every edit stays listed so nothing is lost.
    setLost(lostEdits(initial, form, current ? formFromItem(current) : initial))
    if (current) {
      setConflictItem(current)
      reloadForm(current)
    } else if (item) {
      setReloadAfter(item.version ?? 0)
    }
  }

  const linkRef = useRef<HTMLElement>(null)
  const focusLinks = target.kind === "edit" && target.focusLinks
  useEffect(() => {
    if (!focusLinks) return
    const timer = setTimeout(() => {
      linkRef.current?.scrollIntoView?.({ block: "start" })
      linkRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [focusLinks])

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (readOnly || saving) return
    const found = validateForm(form, flags)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      if (!item) {
        if (await props.onCreate(buildCreateInput(form))) props.onClose()
        return
      }
      const patch = buildPatch(item, form, linkedCount)
      if (Object.keys(patch).length > 0 && !(await props.onSave(item, patch, onConflict))) return
      if (canLink && links.isDirty) {
        try {
          await links.save()
          props.onLinksSaved()
          if (Object.keys(patch).length === 0) toast.success(t.planSavedJustNow)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t.errorUpdateFailed, { title: t.errorUpdateFailed })
          return
        }
      }
      const slip = patchTouchesActuals(patch) ? actualSlip(form) : null
      const moved = plannedEndMove(item, patch)
      if (slip) setShiftSlip(slip)
      else if (moved !== null && props.dependencies.some((d) => d.predecessorId === item.id)) setEndMove(moved)
      else props.onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (item && (await props.onDelete(item))) props.onClose()
  }

  if (item && endMove !== null && shiftSlip === null) {
    return (
      <PlanShiftDialog
        apiBase={props.apiBase}
        itemId={item.id}
        slip={endMove}
        hasSuccessors
        cascade={{ name: nameOf(item) }}
        onClose={props.onClose}
        onApplied={() => {
          props.onShifted()
          props.onClose()
        }}
      />
    )
  }

  if (item && shiftSlip !== null) {
    return (
      <PlanShiftDialog
        apiBase={props.apiBase}
        itemId={item.id}
        slip={shiftSlip}
        hasSuccessors={props.dependencies.some((d) => d.predecessorId === item.id)}
        onClose={props.onClose}
        onApplied={() => {
          props.onShifted()
          props.onClose()
        }}
      />
    )
  }

  const title = item ? (readOnly ? t.planViewTitle : t.planEditTitle) : form.isMilestone ? t.planNewMilestoneTitle : t.planNewItemTitle
  return (
    <Modal
      open
      onClose={props.onClose}
      title={title}
      description={item ? nameOf(item) : undefined}
      size="lg"
      isDirty={isDirty && !saving}
      footer={<Footer saving={saving} readOnly={readOnly} onDelete={item && !readOnly ? () => void handleDelete() : undefined} />}
    >
      <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="space-y-5">
        {lost && (
          <PlanConflictNotice
            lost={lost}
            members={props.members}
            parentOptions={parents}
            onRestore={() => {
              setForm((f) => reapplyEdits(f, lost))
              setLost(null)
            }}
            onDismiss={() => setLost(null)}
          />
        )}
        <fieldset disabled={readOnly} className="min-w-0">
          <PlanEditFields form={form} set={set} flags={flags} item={item} parentOptions={parents} members={props.members} errors={errors} readOnly={readOnly} today={props.today} />
        </fieldset>
        {canLink && item ? (
          <PlanLinkSection ref={linkRef} links={links} itemId={item.id} disabled={readOnly} backlogHref={`${props.backlogPath}?plan=${encodeURIComponent(item.id)}`} />
        ) : item?.hasChildren ? (
          <p className="text-caption text-fg-muted">{t.planLinkLeafOnly}</p>
        ) : (
          !item && !form.isMilestone && <p className="text-caption text-fg-muted">{t.planLinkAfterCreate}</p>
        )}
        {item && (
          <PlanDependencySection
            item={item}
            dependencies={props.dependencies}
            byId={byId}
            nameOf={nameOf}
            canEdit={!readOnly}
            onRemove={props.onRemoveDependency}
          />
        )}
      </form>
    </Modal>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Button, Modal, SkeletonLines, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"

type Scope = "dependents" | "later"

interface Preview {
  deltaDays: number
  moved: Array<{ id: string; name: string; newStart: string; newEnd: string }>
  skipped: Array<{ id: string }>
}

interface Props {
  /** `/api/projects/:id/plan` */
  apiBase: string
  itemId: string
  /** Actual - planned in days (+ = later); never 0. */
  slip: number
  /** The item has a dependent successor (the narrower scope is then the default). */
  hasSuccessors: boolean
  /**
   * Set when the item's planned end itself was moved (bar drag, inline edit,
   * editor): `slip` is then that move and is sent as the shift to apply.
   */
  cascade?: { name: string }
  onClose: () => void
  onApplied: () => void
}

const PREVIEW_ROWS = 6

/** 実績のずれを後続の計画に反映: choose the scope, see what moves, apply. */
export function PlanShiftDialog({ apiBase, itemId, slip, hasSuccessors, cascade, onClose, onApplied }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [scope, setScope] = useState<Scope>(hasSuccessors ? "dependents" : "later")
  const [loaded, setLoaded] = useState<{ scope: Scope; preview: Preview | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const url = `${apiBase}/${itemId}/shift-following`

  useEffect(() => {
    let live = true
    apiFetch<Preview>(url, { method: "POST", json: { scope, apply: false, ...(cascade ? { deltaDays: slip } : {}) } })
      .then((p) => live && setLoaded({ scope, preview: p }))
      .catch(() => live && setLoaded({ scope, preview: null }))
    return () => {
      live = false
    }
  }, [url, scope, slip, cascade])

  async function apply() {
    setBusy(true)
    try {
      const res = await apiFetch<Preview>(url, { method: "POST", json: { scope, apply: true, ...(cascade ? { deltaDays: slip } : {}) } })
      toast.success(fillTemplate(t.planShiftDone, { n: res.moved.length }))
      onApplied()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.planShiftFailed, { title: t.planShiftFailed })
      setBusy(false)
    }
  }

  const days = Math.abs(slip)
  // A preview of another scope is stale: show the skeleton until the new one arrives.
  const current = loaded?.scope === scope ? loaded : null
  const preview = current?.preview ?? null
  const failed = current !== null && current.preview === null
  const moved = preview?.moved ?? []
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={cascade ? t.pscCascadeTitle : t.planShiftTitle}
      description={
        cascade
          ? fillTemplate(slip > 0 ? t.pscCascadeLater : t.pscCascadeEarlier, { name: cascade.name, n: days })
          : fillTemplate(slip > 0 ? t.planShiftLate : t.planShiftEarly, { n: days })
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{cascade ? t.pscCascadeSkip : t.planShiftSkip}</Button>
          <Button onClick={() => void apply()} disabled={moved.length === 0} loading={busy} data-testid="plan-shift-apply">
            {cascade ? t.pscCascadeApply : t.planShiftApply}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          {(["dependents", "later"] as const).map((value) => (
            <label key={value} className="flex min-h-8 items-start gap-2 text-body text-fg">
              <input type="radio" name="plan-shift-scope" className="mt-1 h-4 w-4" checked={scope === value} onChange={() => setScope(value)} data-testid={`plan-shift-${value}`} />
              {value === "dependents" ? t.planShiftScopeDependents : t.planShiftScopeLater}
            </label>
          ))}
        </fieldset>
        <div aria-live="polite" className="rounded-ui-md border border-border p-3">
          {failed ? (
            <p role="alert" className="text-body text-danger">{t.planShiftFailed}</p>
          ) : !preview ? (
            <SkeletonLines lines={3} />
          ) : moved.length === 0 ? (
            <p className="text-body text-fg-muted">{t.planShiftNone}</p>
          ) : (
            <>
              <p className="text-body font-semibold text-fg">{fillTemplate(t.planShiftPreview, { n: moved.length, d: `${slip > 0 ? "+" : "-"}${days}` })}</p>
              <ul className="mt-2 space-y-1 text-caption text-fg-muted">
                {moved.slice(0, PREVIEW_ROWS).map((m) => (
                  <li key={m.id} className="truncate">{m.name}: {m.newStart} → {m.newEnd}</li>
                ))}
                {moved.length > PREVIEW_ROWS && <li>…</li>}
              </ul>
            </>
          )}
          {preview && preview.skipped.length > 0 && (
            <p className="mt-2 text-caption text-fg-muted">{fillTemplate(t.planShiftSkipped, { n: preview.skipped.length })}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

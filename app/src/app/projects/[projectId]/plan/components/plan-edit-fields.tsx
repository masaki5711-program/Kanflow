"use client"

import type { ReactNode } from "react"
import { Badge, Field, Input, Select, Textarea } from "@/components/ui"
import { GlossaryHint } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { formatShortDate } from "../lib/date-format"
import type { DerivedFlags, FormErrorKey, PlanForm } from "../lib/plan-form"
import { PLAN_STATUSES, type PlanItem } from "../lib/plan-types"
import { itemBadge, statusLabel } from "../lib/status"
import { fillTemplate } from "../lib/template"

interface Props {
  form: PlanForm
  set: <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => void
  flags: DerivedFlags
  /** The saved item (null for a draft). */
  item: PlanItem | null
  parentOptions: readonly { id: string; name: string; depth: number }[]
  members: readonly { id: string; name: string }[]
  errors: Partial<Record<FormErrorKey, true>>
}

/** Read-only value of a derived field, marked "自動". */
function Derived({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-caption font-medium text-fg-muted">
        {label}
        <Badge tone="info">{t.planDerivedAuto}</Badge>
      </p>
      <p className="flex min-h-9 items-center rounded-ui-md bg-surface-muted px-3 text-body text-fg">{children}</p>
    </div>
  )
}

/** The editable / derived fields of the plan item editor. */
export function PlanEditFields({ form, set, flags, item, parentOptions, members, errors }: Props) {
  const { t, language } = useLanguage()
  const isLeaf = !item?.hasChildren
  const showMode = isLeaf && !form.isMilestone
  const derivedHint = flags.datesDerived ? t.planDerivedParentHint : flags.statusDerived ? t.planDerivedLinkedHint : null

  return (
    <div className="space-y-4">
      <Field label={t.planNamePlaceholder} required error={errors.name ? t.planNameRequired : undefined}>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={255} data-autofocus />
      </Field>
      <Field label={t.planDescription}>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
      </Field>

      {derivedHint && <p className="rounded-ui-sm bg-info-soft px-3 py-2 text-caption text-info">{derivedHint}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {flags.datesDerived && item ? (
          <>
            <Derived label={t.planPlannedStart}>{formatShortDate(item.plannedStart, language)}</Derived>
            <Derived label={t.planPlannedEnd}>{formatShortDate(item.plannedEnd, language)}</Derived>
          </>
        ) : form.isMilestone ? (
          <Field label={t.planMilestoneDate} required error={errors.plannedStart ? t.planDateRequired : undefined}>
            <Input type="date" value={form.plannedStart} onChange={(e) => set("plannedStart", e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label={t.planPlannedStart} required error={errors.plannedStart ? t.planDateRequired : undefined}>
              <Input type="date" value={form.plannedStart} onChange={(e) => set("plannedStart", e.target.value)} />
            </Field>
            <Field label={t.planPlannedEnd} required error={errors.plannedEnd ? t.planDateOrderError : undefined}>
              <Input type="date" value={form.plannedEnd} min={form.plannedStart || undefined} onChange={(e) => set("plannedEnd", e.target.value)} />
            </Field>
          </>
        )}
        {!form.isMilestone && item && (
          <>
            <Field label={t.planActualStart}>
              <Input type="date" value={form.actualStart} onChange={(e) => set("actualStart", e.target.value)} />
            </Field>
            <Field label={t.planActualEnd} error={errors.actualEnd ? t.planDateOrderError : undefined}>
              <Input type="date" value={form.actualEnd} onChange={(e) => set("actualEnd", e.target.value)} />
            </Field>
          </>
        )}

        {showMode && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-caption font-medium text-fg-muted">{t.planProgressMode}</legend>
            <div className="flex flex-wrap gap-4">
              {(["manual", "linked"] as const).map((m) => (
                <label key={m} className="inline-flex min-h-8 items-center gap-2 text-body text-fg">
                  <input type="radio" name="plan-progress-mode" className="h-4 w-4" checked={form.progressMode === m} onChange={() => set("progressMode", m)} />
                  {m === "manual" ? t.planProgressManual : t.planProgressLinked}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {flags.statusDerived ? (
          <Derived label={t.planStatus}>{item ? itemBadge(t, item).label : statusLabel(t, form.status)}</Derived>
        ) : (
          <Field label={t.planStatus} hint={flags.statusManualUntilLinked ? t.planStatusManualHint : undefined}>
            <Select value={form.status} onChange={(e) => set("status", e.target.value as PlanForm["status"])}>
              {PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(t, s)}</option>
              ))}
            </Select>
          </Field>
        )}
        {item && !form.isMilestone && <Derived label={t.planProgressPct}>{`${item.progressPct}%`}</Derived>}

        <Field label={t.planOwner}>
          <Select value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
            <option value="">{t.planOwnerNone}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.planParent}>
          <Select value={form.parentId} onChange={(e) => set("parentId", e.target.value)}>
            <option value="">{t.planRootOption}</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{"  ".repeat(p.depth)}{p.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {isLeaf && (
        <label className="inline-flex min-h-8 items-center gap-2 text-body text-fg">
          <input type="checkbox" className="h-4 w-4" checked={form.isMilestone} onChange={(e) => set("isMilestone", e.target.checked)} />
          {t.planIsMilestone}
        </label>
      )}

      {item && (
        <p className="text-caption text-fg-muted">
          <span className="font-medium">{t.planBaseline}: </span>
          {item.baselineStart && item.baselineEnd
            ? `${formatShortDate(item.baselineStart, language)} → ${formatShortDate(item.baselineEnd, language)}`
            : t.planBaselineNone}
          {(item.baselineVarianceDays ?? 0) > 0 && (
            <span className="ml-2 rounded-full bg-danger-soft px-1.5 font-medium text-danger-strong">
              {fillTemplate(t.planVarianceLabel, { n: item.baselineVarianceDays ?? 0 })}
            </span>
          )}
        </p>
      )}

      <Field label={t.planNotes}>
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </Field>
      <GlossaryHint />
    </div>
  )
}

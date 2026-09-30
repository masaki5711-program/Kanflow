"use client"

import { useEffect, useId, useRef, type Dispatch, type FormEvent, type SetStateAction } from "react"
import { Button, Field, Input, Select, cn } from "@/components/ui"
import { HelpTooltip } from "@/components/help-tooltip"
import { formatPointUnit, getPointScale } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { AcceptanceCriteriaField, UserStoryField } from "./story-fields"
import type { BacklogForm as FormState, BacklogStatus, GeneratedField, IceboxOption, ProductGoal } from "./types"
import { Lightbulb, Scale, Tag, Target } from "lucide-react"

export interface IceboxUsage {
  displayId: number
  label: string
}

interface Props {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
  isEditing: boolean
  canEdit: boolean
  saving: boolean
  generating: GeneratedField | null
  onGenerate: (field: GeneratedField) => void
  onSubmit: () => void
  onCancel: () => void
  onSelectIcebox: (iceboxId: string) => void
  iceboxOptions: IceboxOption[]
  iceboxUsage: Map<string, IceboxUsage>
  productGoals: ProductGoal[]
  pointUnit: string
}

const MAX_OPTION_CHARS = 60

function LabelWithIcon({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  )
}

/** Inline create/edit form for a PBI. */
export function BacklogForm(props: Props) {
  const { form, setForm, isEditing, canEdit, saving, generating, onGenerate, onSubmit, onCancel } = props
  const { t, pt, language } = useLanguage()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const workloadLabelId = useId()
  const titleId = useId()
  const pointScale = getPointScale(props.pointUnit)
  const pointUnitLabel = formatPointUnit(props.pointUnit, t)
  const isFibonacci = props.pointUnit === "SP" || props.pointUnit === "ポイント"

  // Bring the form into view when it opens (edit buttons live further down the page).
  useEffect(() => {
    headingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit()
  }

  const title = canEdit ? (isEditing ? t.edit : t.backlogAddItem) : t.view

  return (
    <section className="mb-6 overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-sm" aria-labelledby={titleId}>
      <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" aria-hidden="true" />
      <div className="p-6">
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="mb-5 text-title font-semibold text-fg">
          {title}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* NOTE: `generating` is intentionally NOT part of this disabled state —
              a disabled fieldset would also disable the ✨ button, which doubles
              as the stop control while streaming. */}
          <fieldset disabled={!canEdit || saving} className="contents">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={<LabelWithIcon icon={<Lightbulb className="h-3.5 w-3.5 text-purple-600" />} text={`${pt.navIcebox} (${pt.iceboxRequest})`} />}>
                <Select value={form.iceboxItemId} onChange={(e) => props.onSelectIcebox(e.target.value)}>
                  <option value="">{t.backlogIceboxNoneOption}</option>
                  {props.iceboxOptions.map((item) => {
                    const used = props.iceboxUsage.get(item.id)
                    const prefix = used ? `⚠ [${t.backlogIceboxAlreadyUsedTag}] ` : ""
                    const suffix = used ? ` → PBI #${used.displayId}` : ""
                    const req = pickText(item.i18n, "request", item.request, language).text
                    const short = req.length > MAX_OPTION_CHARS ? `${req.slice(0, MAX_OPTION_CHARS)}…` : req
                    return (
                      <option key={item.id} value={item.id}>
                        {prefix}#{item.displayId} - {short} ({item.author}){suffix}
                      </option>
                    )
                  })}
                </Select>
              </Field>
              <Field label={<LabelWithIcon icon={<Target className="h-3.5 w-3.5 text-indigo-600" />} text={t.dashboardProductGoals} />}>
                <Select value={form.productGoalId} onChange={(e) => update("productGoalId", e.target.value)}>
                  <option value="">{t.eventNone}</option>
                  {props.productGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {pickText(goal.i18n, "title", goal.title, language).text}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {form.iceboxItemId && props.iceboxUsage.has(form.iceboxItemId) && (
              <p role="status" className="rounded-ui-sm border border-warning/30 bg-warning-soft px-2 py-1 text-caption text-warning-strong">
                ⚠ {t.backlogIceboxAlreadyUsedTitle}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="relative">
                <Field label={<LabelWithIcon icon={<Tag className="h-3.5 w-3.5 text-fg-muted" />} text={pt.backlogInitiative} />}>
                  <Input value={form.initiative} onChange={(e) => update("initiative", e.target.value)} />
                </Field>
                <div className="absolute right-0 top-0">
                  <HelpTooltip content={pt.backlogInitiativeHelp} ariaLabel={pt.backlogInitiative} side="left" />
                </div>
              </div>
              <div className="relative">
                <Field label={<LabelWithIcon icon={<Tag className="h-3.5 w-3.5 text-fg-muted" />} text={pt.backlogEpic} />}>
                  <Input value={form.epic} onChange={(e) => update("epic", e.target.value)} />
                </Field>
                <div className="absolute right-0 top-0">
                  <HelpTooltip content={pt.backlogEpicHelp} ariaLabel={pt.backlogEpic} side="left" />
                </div>
              </div>
            </div>

            <UserStoryField
              field="userStory"
              value={form.userStory}
              onChange={(v) => update("userStory", v)}
              generating={generating}
              onGenerate={onGenerate}
            />
            <AcceptanceCriteriaField
              field="acceptanceCriteria"
              value={form.acceptanceCriteria}
              onChange={(v) => update("acceptanceCriteria", v)}
              generating={generating}
              onGenerate={onGenerate}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p id={workloadLabelId} className="mb-1.5 flex items-center gap-1.5 text-body font-medium text-fg">
                  <Scale className="h-3.5 w-3.5 text-orange-600" />
                  {pt.backlogWorkloadScore}
                  <span className="text-caption font-normal text-fg-muted">({pointUnitLabel})</span>
                </p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={workloadLabelId}>
                  {pointScale.map((v) => {
                    const isSelected = form.workloadScore === v
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => update("workloadScore", v)}
                        className={cn(
                          "min-h-11 min-w-11 rounded-ui-md border-2 px-3 py-2 text-body font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                          isSelected
                            ? "border-orange-600 bg-orange-600 text-white shadow-ui-sm"
                            : "border-border bg-surface text-fg hover:border-orange-300 hover:bg-orange-50",
                        )}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-caption text-fg-muted">{isFibonacci ? t.backlogFibonacciScale : pointUnitLabel}</p>
              </div>
              <Field label={<LabelWithIcon icon={<Tag className="h-3.5 w-3.5 text-fg-muted" />} text={t.iceboxStatus} />}>
                <Select value={form.status} onChange={(e) => update("status", e.target.value as BacklogStatus)}>
                  <option value="not_ready">{t.backlogStatusNotReady}</option>
                  <option value="ready">{t.backlogStatusReady}</option>
                  <option value="completed">{t.backlogStatusCompleted}</option>
                </Select>
              </Field>
            </div>
          </fieldset>

          <div className="flex gap-2 pt-2">
            {canEdit && (
              <Button type="submit" loading={saving} disabled={generating !== null}>
                {isEditing ? t.update : t.add}
              </Button>
            )}
            <Button variant="secondary" onClick={onCancel}>
              {canEdit ? t.cancel : t.close}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}

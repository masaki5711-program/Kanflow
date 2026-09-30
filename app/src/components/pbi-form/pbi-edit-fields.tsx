"use client"

import { useId, type Dispatch, type SetStateAction } from "react"
import { Field, Input, Select, Textarea, cn } from "@/components/ui"
import { HelpTooltip } from "@/components/help-tooltip"
import { formatPointUnit, getPointScale } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { LabelWithIcon, PbiLinkFields } from "./pbi-link-fields"
import type { PbiForm, PbiStatusValue } from "./pbi-form-state"
import { AcceptanceCriteriaField, UserStoryField } from "./story-fields"
import type { GeneratedField } from "./use-ai-field-generator"
import type { PbiFormOptions } from "./use-pbi-form-options"
import { Tag } from "lucide-react"

interface Props {
  form: PbiForm
  setForm: Dispatch<SetStateAction<PbiForm>>
  options: PbiFormOptions
  /** The edited PBI (undefined while creating). */
  selfId?: string
  /** While saving every field is read-only. */
  disabled?: boolean
  generating: GeneratedField | null
  onGenerate: (field: GeneratedField) => void
}

/**
 * Every editable field of a PBI — the one form used by the detail modal's
 * edit mode and by the create modal.
 */
export function PbiEditFields({ form, setForm, options, selfId, disabled, generating, onGenerate }: Props) {
  const { t, pt } = useLanguage()
  const set = <K extends keyof PbiForm>(key: K) => (value: PbiForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const text = (key: keyof PbiForm) => (e: { target: { value: string } }) => set(key)(e.target.value as never)

  return (
    // NOTE: `generating` is intentionally NOT part of the disabled state — a
    // disabled fieldset would also disable the ✨ button, which doubles as the stop control.
    <fieldset disabled={disabled} className="contents">
      <div className="space-y-4">
        <PbiLinkFields form={form} setForm={setForm} options={options} selfId={selfId} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative">
            <Field label={<LabelWithIcon icon={<Tag className="h-3.5 w-3.5 text-fg-muted" />} text={pt.backlogInitiative} />}>
              <Input value={form.initiative} onChange={text("initiative")} />
            </Field>
            <div className="absolute right-0 top-0">
              <HelpTooltip content={pt.backlogInitiativeHelp} ariaLabel={pt.backlogInitiative} side="left" />
            </div>
          </div>
          <div className="relative">
            <Field label={<LabelWithIcon icon={<Tag className="h-3.5 w-3.5 text-fg-muted" />} text={pt.backlogEpic} />}>
              <Input value={form.epic} onChange={text("epic")} />
            </Field>
            <div className="absolute right-0 top-0">
              <HelpTooltip content={pt.backlogEpicHelp} ariaLabel={pt.backlogEpic} side="left" />
            </div>
          </div>
        </div>
        <UserStoryField field="userStory" value={form.userStory} onChange={set("userStory")} generating={generating} onGenerate={onGenerate} />
        <AcceptanceCriteriaField
          field="acceptanceCriteria"
          value={form.acceptanceCriteria}
          onChange={set("acceptanceCriteria")}
          generating={generating}
          onGenerate={onGenerate}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <WorkloadField value={form.workloadScore} onChange={set("workloadScore")} pointUnit={options.pointUnit} />
          <Field label={t.sprintStatus}>
            <Select value={form.status} onChange={(e) => set("status")(e.target.value as PbiStatusValue)}>
              <option value="not_ready">{t.backlogStatusNotReady}</option>
              <option value="ready">{t.backlogStatusReady}</option>
              <option value="completed">{t.backlogStatusCompleted}</option>
            </Select>
          </Field>
          <Field label={pt.rolePO}>
            <Input value={form.assignedPo} onChange={text("assignedPo")} />
          </Field>
        </div>
        <Field label={t.backlogPoNote}>
          <Textarea value={form.poNote} onChange={text("poNote")} rows={2} />
        </Field>
        {form.status === "not_ready" && (
          <Field label={t.backlogNotReadyReason}>
            <Textarea value={form.notReadyReason} onChange={text("notReadyReason")} rows={2} />
          </Field>
        )}
        <Field label={t.backlogReferenceDoc}>
          <Textarea value={form.referenceDoc} onChange={text("referenceDoc")} rows={2} />
        </Field>
      </div>
    </fieldset>
  )
}

interface WorkloadProps {
  value: string
  onChange: (value: string) => void
  pointUnit: string
}

/** Number input plus one-click chips of the project's point scale. */
function WorkloadField({ value, onChange, pointUnit }: WorkloadProps) {
  const { t, pt } = useLanguage()
  const groupId = useId()
  const unitLabel = formatPointUnit(pointUnit, t)
  return (
    <div>
      <Field label={pt.backlogWorkloadScore} hint={unitLabel}>
        <Input type="number" min={0} step={1} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <div role="group" aria-labelledby={groupId} className="mt-1.5 flex flex-wrap gap-1">
        <span id={groupId} className="sr-only">
          {t.backlogWorkloadQuickPick}
        </span>
        {getPointScale(pointUnit).map((v) => {
          const selected = value.trim() === String(v)
          return (
            <button
              key={v}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(String(v))}
              className={cn(
                "min-h-8 min-w-8 rounded-ui-sm border px-2 text-caption font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "border-orange-600 bg-orange-600 text-white" : "border-border-strong bg-surface text-fg hover:bg-orange-50",
              )}
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

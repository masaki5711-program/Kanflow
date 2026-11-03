"use client"

import { useId, useState } from "react"
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import { ruleKindLabel } from "@/lib/plan-lesson-rules/describe"
import type { LessonRuleKind } from "@/lib/plan-lesson-rules/rules"
import { FORM_KINDS, KIND_FIELDS, toRuleContent, valuesFromParams, type FieldName, type FormValues } from "./rule-form"
import { DialogCancel } from "./dialog-cancel"
import type { LessonRuleView } from "./types"
import { useRuleSummary } from "./use-rule-summary"

export interface RuleEditorSubmit {
  kind: LessonRuleKind
  params: Record<string, unknown>
  quote: string | null
  sourceSprintId: string | null
}

interface Props {
  open: boolean
  /** null = a new draft. */
  rule: LessonRuleView | null
  sprints: { id: string; name: string }[]
  busy: boolean
  onClose: () => void
  onSubmit: (value: RuleEditorSubmit) => void
}

function fieldLabel(f: FieldName, kind: LessonRuleKind, t: Translations): string {
  switch (f) {
    case "key":
      return t.plrFieldKey
    case "factor":
      return t.plrFieldFactor
    case "afterKey":
      return t.plrFieldAfterKey
    case "days":
      return t.plrFieldDays
    case "beforeKey":
      return t.plrFieldBeforeKey
    case "newKey":
      return t.plrFieldNewKey
    case "name":
      return t.plrFieldName
    case "durationDays":
      return t.plrFieldDurationDays
    case "role":
      return kind === "add_prerequisite" ? t.plrFieldRole : t.plrFieldRoleRequired
    case "from":
      return t.plrFieldFrom
    case "to":
      return t.plrFieldTo
    case "parts":
      return t.plrFieldParts
    case "max":
      return t.plrFieldMax
  }
}

const NUMERIC_FIELDS = new Set<FieldName>(["factor", "days", "durationDays", "parts", "max"])
const KEY_FIELDS = new Set<FieldName>(["key", "afterKey", "beforeKey", "newKey", "from", "to"])

/**
 * Write / edit a draft. The preview sentence below the fields is the same sentence the confirm step shows, so the
 * author sees exactly what will be confirmed. Sources other than the sprint (PBIs, lessons) come from the API.
 * While a save is in flight the buttons stay focusable (aria-disabled) and a second submit is ignored.
 */
export function RuleEditor({ open, rule, sprints, busy, onClose, onSubmit }: Props) {
  const { t } = useLanguage()
  const summaryOf = useRuleSummary()
  const baseId = useId()
  const fieldId = (f: FieldName) => `${baseId}-${f}`
  const [kind, setKind] = useState<LessonRuleKind>((rule?.kind as LessonRuleKind) ?? "add_buffer")
  const [values, setValues] = useState<FormValues>(rule ? valuesFromParams(rule.params) : {})
  const [quote, setQuote] = useState(rule?.quote ?? "")
  const [sprintId, setSprintId] = useState("")
  const [invalid, setInvalid] = useState<FieldName | "form" | null>(null)
  const [dirty, setDirty] = useState(false)

  const content = toRuleContent(kind, values)
  const preview = content.ok ? summaryOf(content.kind, content.params) : null

  function submit() {
    if (busy) return
    if (!content.ok) {
      const target = content.field ?? "form"
      setInvalid(target)
      // Take the user to what needs fixing (the Field links the error to the control).
      if (target !== "form") requestAnimationFrame(() => document.getElementById(fieldId(target))?.focus())
      return
    }
    onSubmit({ kind: content.kind, params: content.params, quote: quote.trim() ? quote : null, sourceSprintId: sprintId || null })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={dirty}
      title={rule ? t.plrEditTitle : t.plrNewTitle}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancel />
          <Button onClick={submit} aria-disabled={busy || undefined} aria-busy={busy || undefined} leftIcon={busy ? <Spinner size="sm" /> : undefined}>
            {t.plrSaveDraft}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onChange={() => setDirty(true)}
      >
        <Field label={t.plrFieldKind}>
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as LessonRuleKind)
              setInvalid(null)
            }}
          >
            {FORM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ruleKindLabel(k, t)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {KIND_FIELDS[kind].map((f) => (
            <Field
              key={`${kind}-${f}`}
              id={fieldId(f)}
              label={fieldLabel(f, kind, t)}
              hint={KEY_FIELDS.has(f) ? t.plrFieldKeyHint : undefined}
              error={invalid === f ? t.plrFieldInvalid : undefined}
              required={!(f === "role" && kind === "add_prerequisite")}
              className={f === "name" ? "sm:col-span-2" : undefined}
            >
              <Input
                value={values[f] ?? ""}
                inputMode={NUMERIC_FIELDS.has(f) ? "decimal" : undefined}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f]: e.target.value }))
                  if (invalid === f) setInvalid(null)
                }}
              />
            </Field>
          ))}
        </div>

        <section aria-labelledby={`${baseId}-preview`} className="rounded-ui-sm bg-surface-sunken px-3 py-2">
          <h3 id={`${baseId}-preview`} className="text-caption font-medium text-fg-muted">
            {t.plrPreviewLabel}
          </h3>
          <p className="mt-0.5 text-body font-semibold text-fg tabular-nums [overflow-wrap:anywhere]">
            {preview ?? <span className="font-normal text-fg-muted">{t.plrPreviewIncomplete}</span>}
          </p>
        </section>
        {invalid === "form" && (
          <p role="alert" className="text-caption text-danger">
            {t.plrFieldInvalid}
          </p>
        )}

        <Field label={t.plrFieldQuote} hint={t.plrFieldQuoteHint}>
          <Textarea value={quote} rows={3} maxLength={1000} onChange={(e) => setQuote(e.target.value)} />
        </Field>

        {!rule && sprints.length > 0 && (
          <Field label={t.plrFieldSprint} hint={t.plrFieldSprintHint}>
            <Select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">{t.plrFieldSprintNone}</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}

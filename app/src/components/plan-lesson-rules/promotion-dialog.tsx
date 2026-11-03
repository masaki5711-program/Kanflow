"use client"

import { useId, useState } from "react"
import { Button, Field, Modal, Select, Spinner } from "@/components/ui"
import type { Language } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { projectTypeOptions } from "@/lib/project-type-labels"
import { DialogCancel } from "./dialog-cancel"
import type { LessonRuleView } from "./types"
import { useRuleSummary } from "./use-rule-summary"

/** The project type's name in the UI language (the raw value when unknown). */
export function projectTypeName(value: string, language: Language): string {
  const o = projectTypeOptions.find((p) => p.value === value)
  if (!o) return value
  return language === "en" ? o.labelEn : language === "id" ? o.labelId : o.labelJa
}

interface Props {
  rule: LessonRuleView
  /** The project's own plan lineages: the only lineages the server accepts in a request. */
  lineages: string[]
  /** The project's own type: the only type the server accepts in a request. */
  projectType: string
  busy: boolean
  onClose: () => void
  onSubmit: (filters: { lineage: string | null; projectType: string | null }) => void
}

/** PO's request to share a confirmed rule with a lineage and / or this project type (an admin decides). */
export function PromotionDialog({ rule, lineages, projectType, busy, onClose, onSubmit }: Props) {
  const { t, language } = useLanguage()
  const summaryOf = useRuleSummary()
  const errorId = useId()
  const [lineage, setLineage] = useState(lineages[0] ?? "")
  const [type, setType] = useState(lineages.length === 0 ? projectType : "")
  const [error, setError] = useState(false)

  function submit() {
    if (busy) return
    if (!lineage && !type) {
      setError(true)
      return
    }
    onSubmit({ lineage: lineage || null, projectType: type || null })
  }

  // The error is about the pair, so both selects carry it.
  const invalidProps = error ? { "aria-invalid": true, "aria-describedby": errorId } : {}

  return (
    <Modal
      open
      onClose={onClose}
      title={t.plrPromotionTitle}
      description={t.plrPromotionBody}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancel />
          <Button onClick={submit} aria-disabled={busy || undefined} aria-busy={busy || undefined} leftIcon={busy ? <Spinner size="sm" /> : undefined}>
            {t.plrPromotionSend}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-ui-sm bg-surface-sunken px-3 py-2 text-body font-semibold text-fg tabular-nums [overflow-wrap:anywhere]">{summaryOf(rule.kind, rule.params)}</p>
        <Field label={t.plrPromotionLineage}>
          <Select
            value={lineage}
            {...invalidProps}
            onChange={(e) => {
              setLineage(e.target.value)
              setError(false)
            }}
          >
            <option value="">{t.plrPromotionLineageNone}</option>
            {lineages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.plrPromotionProjectType}>
          <Select
            value={type}
            {...invalidProps}
            onChange={(e) => {
              setType(e.target.value)
              setError(false)
            }}
          >
            <option value="">{t.plrPromotionProjectTypeNone}</option>
            <option value={projectType}>{projectTypeName(projectType, language)}</option>
          </Select>
        </Field>
        {error && (
          <p id={errorId} role="alert" className="text-caption text-danger">
            {t.plrPromotionNeedFilter}
          </p>
        )}
      </div>
    </Modal>
  )
}

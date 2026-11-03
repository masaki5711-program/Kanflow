"use client"

import { useId, useState } from "react"
import { Button, Field, Input, Select, useToast } from "@/components/ui"
import { TEMPLATES_API, type PlanTemplateSummaryDto } from "@/components/plan-templates/template-groups"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"
import type { RunSummary } from "./types"

interface Props {
  projectId: string
  onCreated: (runId: string) => void
}

type Errors = Partial<Record<"template" | "start", string>>

/**
 * 「計画を作る」 form (plan 12 E5): a template and a start date. Templates have no roles yet, so a run made here
 * revises durations and applies the rules without proposing owners (roles come with a schedule from an agent, MCP
 * propose_plan_from_actuals).
 */
export function EstimateForm({ projectId, onCreated }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const base = useId()
  const ids = { template: `${base}-template`, start: `${base}-start`, skip: `${base}-skip` }
  const templates = useApiQuery<PlanTemplateSummaryDto[]>(TEMPLATES_API)
  const [templateId, setTemplateId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [skipWeekends, setSkipWeekends] = useState(true)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    const e: Errors = {}
    if (!templateId) e.template = t.pesErrTemplate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) e.start = t.pesErrStart
    setErrors(e)
    const first = (["template", "start"] as const).find((k) => e[k])
    if (first) {
      document.getElementById(ids[first])?.focus()
      return
    }
    setBusy(true)
    try {
      const run = await apiFetch<{ runId: string; summary: RunSummary }>(`/api/projects/${projectId}/plan/estimate-runs`, { method: "POST", json: { templateId, startDate, skipWeekends } })
      onCreated(run.runId)
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`${base}-title`} className="space-y-4 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <h2 id={`${base}-title`} className="text-title font-semibold text-fg">
        {t.pesFormTitle}
      </h2>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-start"
        onSubmit={(ev) => {
          ev.preventDefault()
          void submit()
        }}
      >
        {templates.error && !templates.data && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-body text-danger sm:col-span-2">
            {t.pesTemplatesFailed}
            <Button size="sm" variant="secondary" onClick={() => void templates.refetch()}>
              {t.errorRetry}
            </Button>
          </div>
        )}
        {templates.data && templates.data.length === 0 && <p className="text-body text-fg-muted sm:col-span-2">{t.pesTemplatesEmpty}</p>}
        <Field id={ids.template} label={t.pesFieldTemplate} error={errors.template} required>
          <Select
            value={templateId}
            onChange={(ev) => {
              setTemplateId(ev.target.value)
              if (errors.template) setErrors((x) => ({ ...x, template: undefined }))
            }}
          >
            <option value="">{templates.isLoading && !templates.data ? t.loading : t.pesFieldTemplatePlaceholder}</option>
            {(templates.data ?? []).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={ids.start} label={t.pesFieldStart} error={errors.start} required>
          <Input
            type="date"
            value={startDate}
            onChange={(ev) => {
              setStartDate(ev.target.value)
              if (errors.start) setErrors((x) => ({ ...x, start: undefined }))
            }}
          />
        </Field>
        <label htmlFor={ids.skip} className="inline-flex min-h-8 items-center gap-2 text-body text-fg sm:col-span-2">
          <input id={ids.skip} type="checkbox" className="h-4 w-4 accent-primary" checked={skipWeekends} onChange={(ev) => setSkipWeekends(ev.target.checked)} />
          {t.pesFieldSkipWeekends}
        </label>
        <p className="text-caption text-fg-muted sm:col-span-2">{t.pesNoRoles}</p>
        <div className="sm:col-span-2">
          <Button type="submit" aria-disabled={busy || undefined}>
            {busy ? t.pesCreating : t.pesCreate}
          </Button>
        </div>
      </form>
    </section>
  )
}

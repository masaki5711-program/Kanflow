"use client"

import { useId, useMemo, useState } from "react"
import { Button, Field, Input, Select, useToast } from "@/components/ui"
import { TEMPLATES_API, type PlanTemplateDto, type PlanTemplateSummaryDto } from "@/components/plan-templates/template-groups"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useLanguage } from "@/lib/language-context"
import { templateRoles } from "@/lib/plan-estimate-run/from-template"
import { RoleAssignmentsError, RoleAssignmentsField, assignmentsToSend, toRoleMembers, type RoleAssignments } from "./role-assignments"
import type { RunSummary } from "./types"

interface Props {
  projectId: string
  onCreated: (runId: string) => void
}

type Errors = Partial<Record<"template" | "start", string>>

/**
 * 「計画を作る」 form (plan 12 E5): a template, a start date, and — when the template's stages carry roles — the
 * project members who can do each role, from whom the levelling proposes owners. Without roles a run revises the
 * durations and applies the rules without proposing owners.
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
  const [assignments, setAssignments] = useState<RoleAssignments>({})
  const detail = useApiQuery<PlanTemplateDto>(templateId ? `${TEMPLATES_API}/${encodeURIComponent(templateId)}` : null)
  const roles = useMemo(() => (detail.data && detail.data.id === templateId ? templateRoles(detail.data.content) : []), [detail.data, templateId])
  const memberRows = useApiQuery<unknown>(roles.length > 0 ? `/api/projects/${encodeURIComponent(projectId)}/members` : null)
  const members = useMemo(() => toRoleMembers(memberRows.data), [memberRows.data])
  const rolesFailed = (detail.error && !detail.data) || (memberRows.error && !memberRows.data)
  const rolesLoading = !!templateId && !rolesFailed && (detail.isLoading || (roles.length > 0 && memberRows.isLoading && !memberRows.data))

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
      const roleAssignments = assignmentsToSend(assignments, roles, members)
      const run = await apiFetch<{ runId: string; summary: RunSummary }>(`/api/projects/${projectId}/plan/estimate-runs`, {
        method: "POST",
        json: { templateId, startDate, skipWeekends, roleAssignments },
      })
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
              // Another template has other roles: the choices of the previous one never travel with it.
              setAssignments({})
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
        {rolesFailed ? (
          <RoleAssignmentsError
            onRetry={() => {
              if (detail.error) void detail.refetch()
              if (memberRows.error) void memberRows.refetch()
            }}
          />
        ) : rolesLoading ? (
          <p role="status" className="text-caption text-fg-muted sm:col-span-2">
            {t.pesRolesLoading}
          </p>
        ) : roles.length > 0 ? (
          <RoleAssignmentsField roles={roles} members={members} value={assignments} onChange={setAssignments} disabled={busy} />
        ) : templateId && detail.data ? (
          <p className="text-caption text-fg-muted sm:col-span-2">{t.pesNoRoles}</p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" aria-disabled={busy || undefined}>
            {busy ? t.pesCreating : t.pesCreate}
          </Button>
        </div>
      </form>
    </section>
  )
}

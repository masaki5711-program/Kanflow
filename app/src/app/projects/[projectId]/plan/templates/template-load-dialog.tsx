"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Settings2 } from "lucide-react"
import { Button, Field, Input, Modal, Select, SkeletonLines, useModalClose, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { buildApplyRows, flattenStages } from "@/lib/plan-templates/tree"
import { TemplatePickerList } from "@/components/plan-templates/template-picker-list"
import { TemplateStageTree } from "@/components/plan-templates/template-stage-tree"
import { TEMPLATES_API, type PlanTemplateDto, type PlanTemplateSummaryDto } from "@/components/plan-templates/template-groups"
import type { ApplicationDto, ApplyResult } from "@/services/plan-templates/plan-templates.apply"
import { isYmd } from "../lib/date"
import { buildFlatTree } from "../lib/tree"
import { WeekendOption } from "./weekend-option"
import type { PlanItem } from "../lib/plan-types"

interface Props {
  projectId: string
  items: readonly PlanItem[]
  nameOf: (item: PlanItem) => string
  onClose: () => void
  onApplied: (result: ApplyResult, template: PlanTemplateSummaryDto) => void
}

function CancelButton() {
  const { t } = useLanguage()
  const close = useModalClose()
  return (
    <Button variant="secondary" onClick={close}>
      {t.cancel}
    </Button>
  )
}

/** Insert position options: top level, then every non-milestone item (indented by depth). */
function useParentOptions(items: readonly PlanItem[], nameOf: (item: PlanItem) => string) {
  return useMemo(
    () => buildFlatTree([...items], new Set(), null).filter((r) => !r.item.isMilestone).map((r) => ({ id: r.item.id, label: `${"　".repeat(r.depth)}${nameOf(r.item)}` })),
    [items, nameOf],
  )
}

/**
 * 「テンプレートを読み込む」: pick a template (search, 共通 / 自分 / みんな),
 * uncheck stages in the preview, choose where to insert, and load. Warns
 * (but allows) when the template was loaded into this project before.
 */
export function TemplateLoadDialog({ projectId, items, nameOf, onClose, onApplied }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [parentId, setParentId] = useState("")
  /** Optional: date the stages at load time from here ("" = load as 日程未定). */
  const [startDate, setStartDate] = useState("")
  const [skipWeekends, setSkipWeekends] = useState(false)
  const [busy, setBusy] = useState(false)
  const list = useApiQuery<PlanTemplateSummaryDto[]>(TEMPLATES_API, { toastOnError: true })
  const detail = useApiQuery<PlanTemplateDto>(selectedId ? `${TEMPLATES_API}/${selectedId}` : null)
  const apps = useApiQuery<ApplicationDto[]>(`/api/projects/${projectId}/plan/templates/applications`)
  const parents = useParentOptions(items, nameOf)
  const previewRef = useRef<HTMLElement>(null)

  const template = detail.data && detail.data.id === selectedId ? detail.data : null
  const total = template ? flattenStages(template.content.stages).length : 0
  const count = template ? buildApplyRows(template.content.stages, [...excluded]).length : 0
  const previous = selectedId ? apps.data?.find((a) => a.templateId === selectedId) : undefined

  function select(id: string) {
    setSelectedId(id)
    setExcluded(new Set())
    // Phones stack the list above the preview: bring the preview into view.
    if (window.matchMedia?.("(max-width: 767px)").matches) requestAnimationFrame(() => previewRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }))
  }

  function toggle(path: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const dated = startDate !== ""
  const startInvalid = dated && !isYmd(startDate)

  async function submit() {
    if (!template || count === 0 || startInvalid) return
    setBusy(true)
    try {
      const result = await apiFetch<ApplyResult>(`/api/projects/${projectId}/plan/templates/apply`, {
        method: "POST",
        json: { templateId: template.id, excludePaths: [...excluded], parentId: parentId || null, ...(dated && { startDate, skipWeekends }) },
      })
      onApplied(result, template)
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.tplLoadFailed, { title: t.tplLoadFailed })
      setBusy(false)
    }
  }

  const appliedDate = previous ? new Date(previous.appliedAt).toLocaleDateString(language) : ""

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t.tplLoadTitle}
      description={t.tplLoadDesc}
      headerActions={
        <Link href="/templates" className="inline-flex min-h-8 items-center gap-1 rounded-ui-sm px-2 text-caption font-medium text-primary hover:underline">
          <Settings2 aria-hidden="true" className="h-4 w-4" />
          {t.tplManage}
        </Link>
      }
      footer={
        <>
          <CancelButton />
          <Button onClick={() => void submit()} disabled={!template || count === 0 || startInvalid} loading={busy} data-testid="tpl-load-submit">
            {fillTemplate(t.tplLoadSubmit, { n: count })}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="md:max-h-[60dvh] md:overflow-y-auto md:pr-1">
          {list.isLoading ? <SkeletonLines lines={6} /> : <TemplatePickerList templates={list.data ?? []} query={query} onQuery={setQuery} selectedId={selectedId} onSelect={select} />}
        </div>
        <section ref={previewRef} aria-label={t.tplPreview} className="min-w-0 space-y-3 rounded-ui-md border border-border p-3 md:max-h-[60dvh] md:overflow-y-auto">
          {!selectedId ? (
            <p className="py-8 text-center text-body text-fg-muted">{t.tplSelectPrompt}</p>
          ) : !template ? (
            <SkeletonLines lines={5} />
          ) : (
            <>
              <div>
                <h3 className="text-body font-semibold text-fg">{template.name}</h3>
                {template.description && <p className="mt-0.5 text-caption text-fg-muted">{template.description}</p>}
              </div>
              {previous && (
                <p role="status" data-testid="tpl-already-applied" className="flex gap-2 rounded-ui-sm bg-warning-soft px-3 py-2 text-caption text-warning-hover">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {fillTemplate(t.tplAlreadyApplied, { date: appliedDate, name: previous.appliedBy?.name ?? t.tplUnknownUser })}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-caption text-fg-muted">
                <span aria-live="polite">{fillTemplate(t.tplSelectedCount, { n: count, total })}</span>
                <Button variant="ghost" size="sm" onClick={() => setExcluded(new Set())}>{t.tplSelectAll}</Button>
                <Button variant="ghost" size="sm" onClick={() => setExcluded(new Set(template.content.stages.map((_, i) => String(i))))}>{t.tplSelectNone}</Button>
              </div>
              <TemplateStageTree content={template.content} excluded={excluded} onToggle={toggle} label={template.name} />
              <Field label={t.tplInsertPosition}>
                <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">{t.tplInsertTop}</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t.tplStartDate} hint={t.tplStartDateHint} error={startInvalid ? t.planDateRequired : undefined}>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="tpl-start-date" />
              </Field>
              <WeekendOption checked={skipWeekends} onChange={setSkipWeekends} disabled={!dated} />
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}

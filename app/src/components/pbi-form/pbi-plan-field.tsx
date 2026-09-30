"use client"

import { useMemo } from "react"
import Link from "next/link"
import { CalendarRange } from "lucide-react"
import { Field, Select } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { normalizePlanData } from "@/app/projects/[projectId]/plan/lib/normalize"
import type { PlanData } from "@/app/projects/[projectId]/plan/lib/plan-types"
import { buildFlatTree } from "@/app/projects/[projectId]/plan/lib/tree"
import { LabelWithIcon } from "./pbi-link-fields"

export const planItemHref = (projectId: string, itemId: string) => `/projects/${projectId}/plan?item=${encodeURIComponent(itemId)}`

/** Read view: "全体計画: <name>" linking to the item in the master plan. */
export function PbiPlanLink({ projectId, planItem }: { projectId: string; planItem: { id: string; name: string } | null | undefined }) {
  const { t } = useLanguage()
  return (
    <div>
      <p className="mb-1 text-caption font-medium text-fg-muted">{t.planPbiField}</p>
      <p className="flex min-h-[38px] items-center rounded-ui-md bg-surface-muted px-3 py-2 text-body">
        {planItem ? (
          <Link
            href={planItemHref(projectId, planItem.id)}
            className="inline-flex items-center gap-1.5 text-primary-strong underline-offset-2 hover:underline"
            aria-label={t.planPbiOpenPlan.replace("{name}", planItem.name)}
          >
            <CalendarRange aria-hidden="true" className="h-4 w-4" />
            {planItem.name}
          </Link>
        ) : (
          <span className="text-fg-subtle">{t.planPbiNone}</span>
        )}
      </p>
    </div>
  )
}

/** Edit view: pick a leaf plan item (loaded from GET /plan when the picker is shown). */
export function PbiPlanPicker({ projectId, value, onChange }: { projectId: string; value: string; onChange: (id: string) => void }) {
  const { t, language } = useLanguage()
  const plan = useApiQuery<PlanData>(`/api/projects/${projectId}/plan`, { parse: (raw) => normalizePlanData(raw) })
  const options = useMemo(
    () =>
      buildFlatTree(plan.data?.items ?? [], new Set()).map((r) => ({
        id: r.item.id,
        label: `${"  ".repeat(r.depth)}${pickText(r.item.i18n, "name", r.item.name, language).text}`,
        selectable: !r.hasChildren && !r.item.isMilestone,
      })),
    [plan.data, language],
  )
  return (
    <Field label={<LabelWithIcon icon={<CalendarRange className="h-3.5 w-3.5 text-fg-muted" />} text={t.planPbiField} />} hint={t.planPbiPickerHint}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-busy={plan.isLoading}>
        <option value="">{t.planPbiNone}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={!o.selectable}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

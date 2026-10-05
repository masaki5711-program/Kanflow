"use client"

import { Diamond } from "lucide-react"
import { Badge, cn } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import type { PlanTemplateContent } from "@/lib/plan-templates/schema"
import { flattenStages, isExcluded } from "@/lib/plan-templates/tree"

interface Props {
  content: PlanTemplateContent
  /** With checkboxes (load preview): the excluded paths and the toggle. */
  excluded?: ReadonlySet<string>
  onToggle?: (path: string) => void
  /** Accessible name of the list. */
  label: string
}

/**
 * Indented list of a template's stages (目安期間, milestone, 完了条件), then
 * its check items / hand-over documents. With `onToggle` each stage gets a
 * checkbox; unchecking a stage greys out its subtree.
 */
export function TemplateStageTree({ content, excluded, onToggle, label }: Props) {
  const { t } = useLanguage()
  const stages = flattenStages(content.stages)
  const checkLabel = content.checkLabel || t.tplChecksDefaultLabel
  return (
    <div className="space-y-3">
      <ul aria-label={label} className="space-y-0.5">
        {stages.map(({ path, depth, node }) => {
          const off = excluded ? isExcluded(path, excluded) : false
          const self = excluded?.has(path) ?? false
          const text = (
            <>
              {node.isMilestone && <Diamond aria-label={t.tplMilestone} className="h-3.5 w-3.5 shrink-0 text-plan-milestone" />}
              <span className={cn("min-w-0 flex-1 truncate", depth === 0 && "font-medium")}>{node.name}</span>
              {node.durationDays !== undefined && (
                <span className="shrink-0 text-caption text-fg-muted tabular-nums">{fillTemplate(t.tplDurationApprox, { n: node.durationDays })}</span>
              )}
            </>
          )
          return (
            <li key={path} data-stage-path={path} className={cn(off && "opacity-50")} style={{ paddingLeft: depth * 20 }}>
              {onToggle ? (
                <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-ui-sm px-1.5 text-body text-fg hover:bg-surface-muted">
                  <input type="checkbox" className="h-4 w-4 shrink-0" checked={!off} disabled={off && !self} onChange={() => onToggle(path)} />
                  {text}
                </label>
              ) : (
                <div className="flex min-h-8 items-center gap-2 px-1.5 text-body text-fg">{text}</div>
              )}
              {node.checklist && node.checklist.length > 0 && !off && (
                <p className="pb-1 pl-8 text-caption text-fg-muted">
                  {t.tplChecklist}: {node.checklist.join(" / ")}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <TemplateExtrasSummary content={content} checkLabel={checkLabel} />
    </div>
  )
}

function TemplateExtrasSummary({ content, checkLabel }: { content: PlanTemplateContent; checkLabel: string }) {
  const { t } = useLanguage()
  const checks = content.checks ?? []
  const documents = content.documents ?? []
  if (checks.length === 0 && documents.length === 0 && !content.budgetEnabled) return null
  return (
    <div className="space-y-2 rounded-ui-md bg-surface-muted p-3 text-caption text-fg-muted">
      {checks.length > 0 && (
        <p>
          <span className="font-semibold text-fg">{fillTemplate(t.tplChecksHeading, { label: checkLabel })}: </span>
          {checks.map((c) => c.name).join(" / ")}
        </p>
      )}
      {documents.length > 0 && (
        <p>
          <span className="font-semibold text-fg">{t.tplDocumentsHeading}: </span>
          {documents.join(" / ")}
        </p>
      )}
      {content.budgetEnabled && <Badge tone="info">{t.tplBudgetEnabled}</Badge>}
    </div>
  )
}

"use client"

import { useId } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, X } from "lucide-react"
import { IconButton } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { dependencySeverity, type DependencySeverity } from "../lib/geometry"
import type { PlanDependency, PlanItem } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"

interface Props {
  item: PlanItem
  dependencies: readonly PlanDependency[]
  byId: ReadonlyMap<string, PlanItem>
  nameOf: (item: PlanItem) => string
  canEdit: boolean
  onRemove: (dependencyId: string) => void
}

/** Predecessors / successors of the edited item; removal applies immediately. */
export function PlanDependencySection({ item, dependencies, byId, nameOf, canEdit, onRemove }: Props) {
  const { t } = useLanguage()
  const headingId = useId()
  const preds = dependencies.filter((d) => d.successorId === item.id)
  const succs = dependencies.filter((d) => d.predecessorId === item.id)

  const row = (dep: PlanDependency, otherId: string, icon: React.ReactNode, severity: DependencySeverity) => {
    const other = byId.get(otherId)
    if (!other) return null
    const name = nameOf(other)
    return (
      <li key={dep.id} className="flex items-center gap-2 rounded-ui-sm bg-surface-muted px-2 py-1 text-body">
        {icon}
        <span className="min-w-0 flex-1 truncate text-fg" title={name}>{name}</span>
        {severity !== "none" && (
          <span data-severity={severity} className={`inline-flex items-center gap-1 text-caption ${severity === "before" ? "text-danger-strong" : "text-warning-strong"}`}>
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            {severity === "before" ? t.planDependencyViolated : t.planDependencySameDay}
          </span>
        )}
        {canEdit && (
          <IconButton size="sm" label={fillTemplate(t.planDependencyRemove, { name })} icon={<X className="h-4 w-4" />} onClick={() => onRemove(dep.id)} />
        )}
      </li>
    )
  }

  return (
    <section aria-labelledby={headingId} className="space-y-2 rounded-ui-md border border-border p-3">
      <h3 id={headingId} className="text-body font-semibold text-fg">{t.planDependencies}</h3>
      {preds.length === 0 && succs.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.planDependencyNone}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-caption font-medium text-fg-muted">{t.planPredecessors}</p>
            <ul className="space-y-1">
              {preds.map((d) => {
                const other = byId.get(d.predecessorId)
                return row(d, d.predecessorId, <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5 text-fg-muted" />, other ? dependencySeverity(other, item) : "none")
              })}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-caption font-medium text-fg-muted">{t.planSuccessors}</p>
            <ul className="space-y-1">
              {succs.map((d) => {
                const other = byId.get(d.successorId)
                return row(d, d.successorId, <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-fg-muted" />, other ? dependencySeverity(item, other) : "none")
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

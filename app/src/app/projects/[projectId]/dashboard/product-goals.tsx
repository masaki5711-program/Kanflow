"use client"

import { useState } from "react"
import { Button, EmptyState, cn, useToast, useConfirm } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { GoalFormModal } from "./goal-form-modal"
import { ROW_ACTIONS_VISIBILITY } from "./file-row"
import type { ProductGoal } from "./types"
import { Star, Target } from "lucide-react"

interface ProductGoalsProps {
  projectId: string
  initialGoals: ProductGoal[]
  /** goal.write — without it the list is read-only. */
  canEdit: boolean
}

/** Product goal list with add / edit / delete (for roles with goal.write). */
export function ProductGoals({ projectId, initialGoals, canEdit }: ProductGoalsProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const [goals, setGoals] = useState<ProductGoal[]>(initialGoals)
  // undefined = closed, null = new goal, goal = editing that goal.
  const [editing, setEditing] = useState<ProductGoal | null | undefined>(undefined)

  function handleSaved(saved: ProductGoal, isNew: boolean) {
    setGoals((prev) => (isNew ? [...prev, saved] : prev.map((g) => (g.id === saved.id ? saved : g))))
  }

  async function handleDelete(goal: ProductGoal) {
    const ok = await confirm({ message: `${t.delete}?`, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })
    if (!ok) return
    const prev = goals
    setGoals((list) => list.filter((g) => g.id !== goal.id))
    try {
      await apiFetch(`/api/projects/${projectId}/goals/${goal.id}`, { method: "DELETE" })
    } catch (err) {
      setGoals(prev)
      toast.error(err instanceof Error ? err.message : t.dashboardDeleteFailed, { title: t.dashboardDeleteFailed })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="text-body font-semibold text-fg">{t.dashboardProductGoals}</h3>
        </div>
        {canEdit && <Button size="sm" onClick={() => setEditing(null)}>{t.dashboardAddGoal}</Button>}
      </div>
      {goals.length > 0 ? (
        <ul className="space-y-2">
          {goals.map((goal) => (
            <li key={goal.id} className="flex items-start gap-2.5 bg-surface-muted rounded-ui-sm p-3 group hover:bg-surface-sunken">
              <Star className="w-4 h-4 text-amber-500 fill-current mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <I18nText as="p" className="text-body font-semibold text-fg whitespace-pre-wrap leading-relaxed" i18n={goal.i18n} field="title" original={goal.title} entity={{ type: "product_goal", id: goal.id }} />
                {goal.description && (
                  <I18nText as="p" className="text-caption text-fg-muted mt-0.5 whitespace-pre-wrap leading-relaxed" i18n={goal.i18n} field="description" original={goal.description} entity={{ type: "product_goal", id: goal.id }} />
                )}
              </div>
              {canEdit && (
                <div className={cn("flex gap-1 shrink-0", ROW_ACTIONS_VISIBILITY)}>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(goal)}>{t.edit}</Button>
                  <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => void handleDelete(goal)}>{t.delete}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<Target className="w-6 h-6" />} title={t.dashboardNoGoals} headingLevel={4} />
      )}
      {canEdit && editing !== undefined && (
        <GoalFormModal projectId={projectId} goal={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}
    </div>
  )
}

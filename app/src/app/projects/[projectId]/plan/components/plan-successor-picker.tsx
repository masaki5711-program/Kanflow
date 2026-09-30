"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Button, EmptyState, Input, Modal } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { formatShortDate } from "../lib/date-format"
import type { PlanDependency, PlanItem } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"
import { ancestorIds, buildFlatTree } from "../lib/tree"

interface Props {
  predecessor: PlanItem
  items: readonly PlanItem[]
  dependencies: readonly PlanDependency[]
  nameOf: (item: PlanItem) => string
  onPick: (successorId: string) => void
  onClose: () => void
}

/**
 * "Add successor…" picker: every item that can follow the predecessor
 * (not itself, its ancestors, or an existing successor), filterable by name.
 */
export function PlanSuccessorPicker({ predecessor, items, dependencies, nameOf, onPick, onClose }: Props) {
  const { t, language } = useLanguage()
  const [q, setQ] = useState("")
  const candidates = useMemo(() => {
    const excluded = new Set([
      predecessor.id,
      ...ancestorIds(items, predecessor.id),
      ...dependencies.filter((d) => d.predecessorId === predecessor.id).map((d) => d.successorId),
    ])
    const needle = q.trim().toLowerCase()
    return buildFlatTree(items, new Set()).filter(
      (r) => !excluded.has(r.item.id) && (!needle || nameOf(r.item).toLowerCase().includes(needle)),
    )
  }, [dependencies, items, nameOf, predecessor.id, q])

  return (
    <Modal
      open
      onClose={onClose}
      closeOnOverlayClick
      size="md"
      title={t.planPickSuccessorTitle}
      description={fillTemplate(t.planPickSuccessorDesc, { name: nameOf(predecessor) })}
      footer={<Button variant="secondary" onClick={onClose}>{t.cancel}</Button>}
    >
      <label className="relative mb-3 block">
        <span className="sr-only">{t.planPickSuccessorSearch}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input type="search" value={q} placeholder={t.planPickSuccessorSearch} onChange={(e) => setQ(e.target.value)} className="pl-8" data-autofocus />
      </label>
      {candidates.length === 0 ? (
        <EmptyState compact title={t.planNoMatches} />
      ) : (
        <ul className="space-y-0.5">
          {candidates.map((r) => (
            <li key={r.item.id}>
              <button
                type="button"
                onClick={() => onPick(r.item.id)}
                className="flex min-h-10 w-full items-center gap-2 rounded-ui-sm px-2 text-left text-body text-fg hover:bg-surface-muted"
                style={{ paddingLeft: 8 + r.depth * 14 }}
              >
                {r.item.isMilestone && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rotate-45 bg-plan-milestone" />}
                <span className="min-w-0 flex-1 truncate">{nameOf(r.item)}</span>
                <span className="shrink-0 text-caption text-fg-muted tabular-nums">{formatShortDate(r.item.plannedStart, language)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

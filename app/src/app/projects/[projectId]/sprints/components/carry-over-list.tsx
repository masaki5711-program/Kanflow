"use client"

import { useId } from "react"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { pickText } from "@/lib/translation/pick-text"
import { IconButton, cn } from "@/components/ui"
import type { CarryOverSource } from "../lib/sprint-metrics"
import { CornerDownRight, Eye } from "lucide-react"

interface Props {
  source: CarryOverSource
  /** PBIs the user took off the list (everything is carried unless unticked). */
  skippedIds: ReadonlySet<string>
  onToggle: (pbiId: string) => void
  onViewPbi: (pbiId: string) => void
}

/** Unfinished PBIs of the previous sprint, ticked by default: their open tasks are copied into the new sprint. */
export default function CarryOverList({ source, skippedIds, onToggle, onViewPbi }: Props) {
  const { t, language } = useLanguage()
  const labelId = useId()
  const sprintName = pickText(source.sprint.i18n, "sprintName", source.sprint.sprintName, language).text

  return (
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className="flex items-center gap-1.5 text-body font-medium text-fg">
        <CornerDownRight className="w-4 h-4 text-fg-subtle" /> {t.sprintCarryOver}
      </span>
      <p className="text-caption text-fg-muted mt-0.5 mb-2">{fillTemplate(t.sprintCarryOverHint, { sprint: sprintName })}</p>
      <ul className="border border-border rounded-ui-sm max-h-48 overflow-y-auto">
        {source.candidates.map(({ pbItem, openTasks }) => {
          const checked = !skippedIds.has(pbItem.id)
          const label =
            pickText(pbItem.i18n, "initiative", pbItem.initiative, language).text ||
            pickText(pbItem.i18n, "userStory", pbItem.userStory, language).text ||
            t.sprintNotEntered
          return (
            <li key={pbItem.id}
              className={cn("flex items-center gap-3 px-3 py-1.5 border-b border-border last:border-0 hover:bg-primary-soft/40", checked && "bg-primary-soft/60")}>
              <label className="flex items-center gap-3 flex-1 min-w-0 min-h-8 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => onToggle(pbItem.id)}
                  className="h-4 w-4 rounded border-border-strong accent-primary" />
                <span className="text-caption font-mono text-fg-muted">#{pbItem.displayId}</span>
                <span className="flex-1 text-body text-fg truncate" title={label}>{label}</span>
                <span className="text-caption text-fg-muted whitespace-nowrap">
                  {openTasks > 0 ? fillTemplate(t.sprintCarryOverOpenTasks, { count: openTasks }) : t.sprintCarryOverNoTasks}
                </span>
                <span className="text-caption font-medium bg-warning-soft text-warning-strong border border-warning/30 px-2 py-0.5 rounded-full">
                  {pbItem.workloadScore ?? 0}
                </span>
              </label>
              <IconButton size="sm" label={`${t.view}: #${pbItem.displayId}`} icon={<Eye className="w-4 h-4" />}
                onClick={() => onViewPbi(pbItem.id)} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

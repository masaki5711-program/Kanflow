"use client"

import { useId, useState } from "react"
import { BarChart3 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import BurndownChart from "@/components/burndown-chart"
import VelocityChart from "@/components/burndown/velocity-chart"
import { PageHeader, Select } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

export interface BurndownSprintOption {
  id: string
  name: string
  status: string
}

interface Props {
  projectId: string
  /** Active / review / done sprints, newest first. */
  sprints: BurndownSprintOption[]
}

/** "" = the whole project (all non-archived sprints). */
const ALL = ""

/** Default selection: the active sprint, else the whole project. */
export function defaultSprintSelection(sprints: readonly BurndownSprintOption[]): string {
  return sprints.find((s) => s.status === "active")?.id ?? ALL
}

export function BurndownPageContent({ projectId, sprints }: Props) {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.burndownPageTitle)
  const selectId = useId()
  const [selected, setSelected] = useState(() => defaultSprintSelection(sprints))

  const statusLabel: Record<string, string> = {
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={t.burndownPageTitle}
        icon={
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-ui-md bg-primary-soft text-primary-strong">
            <BarChart3 className="w-4 h-4" />
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-body font-medium text-fg-muted">
              {t.burndownSprintSelect}
            </label>
            <Select id={selectId} selectSize="sm" value={selected} onChange={(e) => setSelected(e.target.value)} className="min-w-[14rem]">
              <option value={ALL}>{t.burndownSprintAll}</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {statusLabel[s.status] ?? s.status}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <BurndownChart projectId={projectId} sprintId={selected || null} refreshable />
      <VelocityChart projectId={projectId} />
    </div>
  )
}

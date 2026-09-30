"use client"

import { useId } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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
  /** Active / review / done / archived sprints, newest first. */
  sprints: BurndownSprintOption[]
}

/** "" = the whole project (all non-archived sprints). An archived sprint is selectable on its own. */
const ALL = ""

/** `?sprint=all` keeps the whole-project choice across reloads. */
export const SPRINT_PARAM = "sprint"
const ALL_PARAM = "all"

/** Default selection: the active sprint, else the whole project. */
export function defaultSprintSelection(sprints: readonly BurndownSprintOption[]): string {
  return sprints.find((s) => s.status === "active")?.id ?? ALL
}

/** Selection from `?sprint=` ("all" or a listed sprint id); anything else → the default. */
export function sprintSelectionFromParam(param: string | null, sprints: readonly BurndownSprintOption[]): string {
  if (param === ALL_PARAM) return ALL
  if (param && sprints.some((s) => s.id === param)) return param
  return defaultSprintSelection(sprints)
}

/** `?sprint=` value of a selection. */
export function sprintParamOf(selection: string): string {
  return selection === ALL ? ALL_PARAM : selection
}

/** Pure: archived sprints apart from the rest, each keeping the given (newest-first) order. */
export function splitArchived<T extends Pick<BurndownSprintOption, "status">>(sprints: readonly T[]): { live: T[]; archived: T[] } {
  return {
    live: sprints.filter((s) => s.status !== "archived"),
    archived: sprints.filter((s) => s.status === "archived"),
  }
}

export function BurndownPageContent({ projectId, sprints }: Props) {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.burndownPageTitle)
  const selectId = useId()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = sprintSelectionFromParam(searchParams.get(SPRINT_PARAM), sprints)

  function select(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(SPRINT_PARAM, sprintParamOf(next))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Finished sprints auto-archive; they stay selectable under their own group (S-10).
  const { live, archived } = splitArchived(sprints)

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
            <Select id={selectId} selectSize="sm" value={selected} onChange={(e) => select(e.target.value)} className="min-w-0 max-w-full sm:min-w-[14rem]">
              <option value={ALL}>{t.burndownSprintAll}</option>
              {live.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {statusLabel[s.status] ?? s.status}
                </option>
              ))}
              {archived.length > 0 && (
                <optgroup label={t.sprintStatusArchived}>
                  {archived.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        }
      />
      <BurndownChart projectId={projectId} sprintId={selected || null} refreshable />
      <VelocityChart projectId={projectId} />
    </div>
  )
}

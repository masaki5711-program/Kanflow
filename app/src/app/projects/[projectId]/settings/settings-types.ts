import type { ProjectDetailDto, ProjectMemberDto, SectionRefDto } from "@/types/api"
import type { EntityI18n } from "@/lib/translation/types"

export type Member = Pick<ProjectMemberDto, "id" | "role"> & {
  user: Omit<ProjectMemberDto["user"], "avatarUrl">
}

export interface SprintSettings {
  defaultCapacity: number
  sprintDurationDays: number
  pointUnit: string
  pointDescription: string
}

export interface SprintHistory {
  id?: string
  sprintName: string
  capacity: number
  actualScore: number
  status: string
  /** Both-language sprint name (from the sprints API). */
  i18n?: EntityI18n
}

export type SectionOption = SectionRefDto

/** Subset of GET /api/projects/:id used by the settings page. */
export type ProjectSettingsResponse = ProjectDetailDto

export const SPRINT_HISTORY_LIMIT = 10

export const ROLE_CLASSES: Record<string, string> = {
  po: "bg-primary-soft text-primary-active",
  sm: "bg-success-soft text-success",
  dev: "bg-surface-sunken text-fg",
}

export function toSprintSettings(project: ProjectSettingsResponse): SprintSettings {
  return {
    defaultCapacity: project.defaultCapacity ?? 0,
    sprintDurationDays: project.sprintDurationDays ?? 7,
    pointUnit: project.pointUnit ?? "SP",
    pointDescription: project.pointDescription ?? "",
  }
}

export function toSectionIds(project: ProjectSettingsResponse): string[] {
  if (!Array.isArray(project.sections)) return []
  return project.sections.map((s) => s.id ?? s.section?.id ?? "").filter(Boolean)
}

export function toSprintHistory(data: unknown): SprintHistory[] {
  if (!Array.isArray(data)) return []
  return (data as SprintHistory[])
    .filter((s) => s.status === "done" || s.status === "archived")
    .slice(0, SPRINT_HISTORY_LIMIT)
}

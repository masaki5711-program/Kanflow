import type { EntityI18n } from "@/lib/translation/types"

/**
 * Product backlog item DTOs (GET /api/projects/:id/backlog and the PBI
 * sub-selects embedded in sprint / release responses). Dates are ISO strings.
 */

/** The PBI fields every embedding endpoint returns (sprint tasks, releases, pickers). */
export interface PbiSummaryDto {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
  i18n?: EntityI18n
}

/** PBI summary plus its backlog status (ready-list pickers, release rows). */
export interface PbiWithStatusDto extends PbiSummaryDto {
  status: string
}

/** One row of GET /api/projects/:id/backlog (`readyItems` / `notReadyItems` / `completedItems`). */
export interface BacklogItemDto extends PbiWithStatusDto {
  acceptanceCriteria: string | null
  assignedPo: string | null
  sortOrder: number
  completedAt: string | null
  iceboxItemId: string | null
  iceboxItem: { id: string; displayId: number; request: string; i18n?: EntityI18n } | null
  productGoalId: string | null
  productGoal: { id: string; title: string; i18n?: EntityI18n } | null
  /** Planning/active sprints already working on this PBI (one row per sprint task). */
  sprintItems?: { sprint: { id: string; sprintName: string; status: string } }[]
}

/** GET /api/projects/:id/backlog/:itemId — the list row plus the PO-only text fields. */
export interface BacklogItemDetailDto extends Omit<BacklogItemDto, "sortOrder" | "sprintItems"> {
  referenceDoc: string | null
  notReadyReason: string | null
  poNote: string | null
  createdAt: string
  updatedAt: string
}

/** GET /api/projects/:id/backlog, parameterised by the row shape a caller relies on. */
export interface BacklogListResponse<T = BacklogItemDto> {
  readyItems: T[]
  notReadyItems: T[]
  completedItems?: T[]
  totalWorkload: number
}

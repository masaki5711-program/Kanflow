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

/** The other end of a PBI dependency (finish-to-start). */
export interface PbiDependencyRefDto {
  /** Id of the link (DELETE /backlog/dependencies/:id). */
  dependencyId: string
  id: string
  displayId: number
  initiative: string | null
  userStory: string | null
  status: string
  i18n?: EntityI18n
}

/** One row of GET /api/projects/:id/backlog (`readyItems` / `notReadyItems` / `completedItems`). */
export interface BacklogItemDto extends PbiWithStatusDto {
  acceptanceCriteria: string | null
  assignedPo: string | null
  sortOrder: number
  /** 機密 (D-5): never given to the MCP / dev API; the web UI shows it with a badge. */
  confidential?: boolean
  completedAt: string | null
  iceboxItemId: string | null
  iceboxItem: { id: string; displayId: number; request: string; i18n?: EntityI18n } | null
  productGoalId: string | null
  productGoal: { id: string; title: string; i18n?: EntityI18n } | null
  /** Optimistic-lock version (send it back on PATCH / DELETE; stale → 409 VERSION_CONFLICT). */
  version?: number
  /** Planning/active sprints already working on this PBI (one row per sprint task). */
  sprintItems?: { sprint: { id: string; sprintName: string; status: string; i18n?: EntityI18n } }[]
  /** PBIs that must be completed before this one can start. */
  blockedBy?: PbiDependencyRefDto[]
  /** PBIs waiting for this one. */
  blocking?: PbiDependencyRefDto[]
}

/** File / image in a PBI's 参考資料 (GET|POST /api/projects/:id/backlog/:itemId/attachments). */
export interface PbiAttachmentDto {
  id: string
  fileName: string
  originalName: string
  fileSize: number
  mimeType: string
  createdAt: string
}

/** GET /api/projects/:id/backlog/:itemId — the list row plus the PO-only text fields. */
export interface BacklogItemDetailDto extends Omit<BacklogItemDto, "sortOrder" | "sprintItems"> {
  referenceDoc: string | null
  /** Files / images of the 参考資料 section, oldest first. */
  attachments?: PbiAttachmentDto[]
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

import type {
  BacklogItemDto,
  BacklogListResponse,
  IceboxItemDto,
  ProductGoalDto,
  ProjectMemberDto,
} from "@/types/api"

/** Shared API DTOs (see src/types/api). */
export type ProductGoal = ProductGoalDto
export type BacklogItem = BacklogItemDto

/** IceBox candidates offered in the PBI form's source picker. */
export type IceboxOption = Pick<
  IceboxItemDto,
  "id" | "displayId" | "request" | "background" | "author" | "status" | "i18n"
>

export type BacklogStatus = "ready" | "not_ready" | "completed"

export type BacklogResponse = BacklogListResponse<BacklogItem>

export interface IceboxResponse {
  unreviewed: IceboxOption[]
  reviewed: IceboxOption[]
}

/** Role + user id (permission checks) and name (PO assignment picker). */
export type ProjectMember = Pick<ProjectMemberDto, "role"> & { user: Pick<ProjectMemberDto["user"], "id"> & { name?: string | null } }

/** Maps a section status to the list key of the GET /backlog response. */
export const LIST_KEY: Record<BacklogStatus, "readyItems" | "notReadyItems" | "completedItems"> = {
  ready: "readyItems",
  not_ready: "notReadyItems",
  completed: "completedItems",
}

/** Case-insensitive search across the text fields of a PBI. */
export function matchesQuery(item: BacklogItem, q: string): boolean {
  if (!q) return true
  return (
    (item.initiative ?? "").toLowerCase().includes(q) ||
    (item.epic ?? "").toLowerCase().includes(q) ||
    (item.userStory ?? "").toLowerCase().includes(q) ||
    (item.acceptanceCriteria ?? "").toLowerCase().includes(q) ||
    String(item.displayId).includes(q)
  )
}

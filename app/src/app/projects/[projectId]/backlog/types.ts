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

/** Only the role and user id are read (permission checks). */
export type ProjectMember = Pick<ProjectMemberDto, "role"> & { user: Pick<ProjectMemberDto["user"], "id"> }

export interface BacklogForm {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: number
  status: BacklogStatus
  iceboxItemId: string
  productGoalId: string
}

export type GeneratedField = "userStory" | "acceptanceCriteria"

export const EMPTY_FORM: BacklogForm = {
  initiative: "",
  epic: "",
  userStory: "",
  acceptanceCriteria: "",
  workloadScore: 0,
  status: "not_ready",
  iceboxItemId: "",
  productGoalId: "",
}

/** Maps a section status to the list key of the GET /backlog response. */
export const LIST_KEY: Record<BacklogStatus, "readyItems" | "notReadyItems" | "completedItems"> = {
  ready: "readyItems",
  not_ready: "notReadyItems",
  completed: "completedItems",
}

/** The PBI fields the form edits (list rows and the GET /backlog/:id detail both have them). */
export type BacklogFormSource = Pick<
  BacklogItem,
  "initiative" | "epic" | "userStory" | "acceptanceCriteria" | "workloadScore" | "status" | "iceboxItemId" | "productGoalId"
>

export function formFromItem(item: BacklogFormSource): BacklogForm {
  return {
    initiative: item.initiative ?? "",
    epic: item.epic ?? "",
    userStory: item.userStory ?? "",
    acceptanceCriteria: item.acceptanceCriteria ?? "",
    workloadScore: item.workloadScore,
    status: item.status as BacklogStatus,
    iceboxItemId: item.iceboxItemId ?? "",
    productGoalId: item.productGoalId ?? "",
  }
}

export function isFormEqual(a: BacklogForm, b: BacklogForm): boolean {
  return (Object.keys(a) as (keyof BacklogForm)[]).every((k) => a[k] === b[k])
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

/** Returns a new array with the elements at `from` and `to` swapped. */
export function swapped<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list]
  const next = [...list]
  next[from] = list[to]
  next[to] = list[from]
  return next
}

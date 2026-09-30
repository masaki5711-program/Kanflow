// URL state of the sprint view / filters (pure). Params:
//   view=board        (list is the default and is omitted)
//   swim=assignee|pbi (swimlanes; none is omitted)
//   assignee=me|unassigned|<userId>
//   q=<text>
import { EMPTY_FILTER, SWIMLANE_MODES, type SwimlaneMode, type TaskFilter } from "./board-model"

export type SprintView = "list" | "board"
const VIEWS: readonly SprintView[] = ["list", "board"]

export const MAX_QUERY_LENGTH = 100
/** User ids are cuid-like; anything else in the URL is ignored. */
const ASSIGNEE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export interface BoardParams {
  /** null = not in the URL (fall back to the remembered preference). */
  view: SprintView | null
  swimlane: SwimlaneMode
  filter: TaskFilter
}

export interface BoardParamsPatch {
  view?: SprintView
  swimlane?: SwimlaneMode
  assignee?: string
  query?: string
}

interface ParamReader {
  get(name: string): string | null
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function parseBoardParams(params: ParamReader): BoardParams {
  const assignee = params.get("assignee") ?? ""
  return {
    view: oneOf(params.get("view"), VIEWS),
    swimlane: oneOf(params.get("swim"), SWIMLANE_MODES) ?? "none",
    filter: {
      assignee: ASSIGNEE_PATTERN.test(assignee) ? assignee : EMPTY_FILTER.assignee,
      query: (params.get("q") ?? "").slice(0, MAX_QUERY_LENGTH),
    },
  }
}

/** New query string (without "?") with the patch applied; defaults are removed. */
export function withBoardParams(current: string, patch: BoardParamsPatch): string {
  const next = new URLSearchParams(current)
  const put = (name: string, value: string | undefined, isDefault: boolean) => {
    if (value === undefined) return
    if (isDefault) next.delete(name)
    else next.set(name, value)
  }
  put("view", patch.view, patch.view === "list")
  put("swim", patch.swimlane, patch.swimlane === "none")
  put("assignee", patch.assignee, patch.assignee === "")
  const query = patch.query?.trim()
  put("q", query, query === "")
  return next.toString()
}

// ---------------------------------------------------------------- remembered view

export function storedViewKey(userId: string | null | undefined): string {
  return `kanflow:sprintView:${userId || "anonymous"}`
}

export function parseStoredView(raw: string | null): SprintView | null {
  return oneOf(raw, VIEWS)
}

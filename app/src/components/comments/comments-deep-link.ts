/**
 * Deep links that open an item's comment thread: the item's own link plus
 * `&tab=comments` (PBI `?pbi=<id>&tab=comments`, sprint task
 * `?task=<id>&tab=comments`, IceBox `?item=<id>&tab=comments`).
 * Pure helpers; dependency-free so server code and tests may import them.
 */
import type { CommentEntityType } from "./types"

export const TAB_PARAM = "tab"
export const COMMENTS_TAB = "comments"

/** Query param that deep-links one item of each type on its list page. */
const ITEM_PARAM: Partial<Record<CommentEntityType, string>> = { sprint_task: "task", icebox: "item" }

/** Id of the item whose comments the URL asks to open (`?task=<id>&tab=comments`), else null. */
export function commentsDeepLinkTarget(search: string, entityType: CommentEntityType): string | null {
  const param = ITEM_PARAM[entityType]
  if (!param) return null
  const sp = new URLSearchParams(search)
  if (sp.get(TAB_PARAM) !== COMMENTS_TAB) return null
  return sp.get(param) || null
}

/** `search` without `?tab=` (so a reload does not open the comments again). Returns "" or "?…". */
export function withoutTabParam(search: string): string {
  const sp = new URLSearchParams(search)
  sp.delete(TAB_PARAM)
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}

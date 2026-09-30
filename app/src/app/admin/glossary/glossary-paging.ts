/** Pure paging helpers for the glossary table (unit-tested). */

export interface KnownTotal {
  /** Identifies the result set (direction + search) the total belongs to. */
  key: string
  total: number
}

/**
 * Total to display. While the next page of the SAME result set is loading
 * (`loadedTotal` undefined) the last known total is kept, so the pager and the
 * summary do not disappear / flash to 0 between pages.
 */
export function resolveTotal(loadedTotal: number | undefined, known: KnownTotal | null, key: string): number {
  if (loadedTotal !== undefined) return loadedTotal
  return known?.key === key ? known.total : 0
}

export interface PagerInfo {
  page: number
  pages: number
  hasPrev: boolean
  hasNext: boolean
}

export function pagerInfo(offset: number, total: number, pageSize: number): PagerInfo {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(pages, Math.floor(offset / pageSize) + 1)
  return { page, pages, hasPrev: page > 1, hasNext: page < pages }
}

/**
 * Whether a (debounced) search input should be applied. Only a real change of
 * the trimmed query applies it and resets to page 1 — the mount-time run of the
 * debounce must not undo a page change the user made in the meantime.
 */
export function isSearchChange(input: string, appliedQuery: string): boolean {
  return input.trim() !== appliedQuery
}

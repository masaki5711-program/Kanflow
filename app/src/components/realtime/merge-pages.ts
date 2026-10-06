export interface IdPage<T extends { id: string }> {
  items: T[]
  nextCursor: string | null
}

/**
 * Pure: a freshly read FIRST page of a newest-first list (activity feed,
 * change history) merged into what is shown. New entries go on top and the
 * pages the user already loaded stay; when the fresh page shares nothing
 * with the list (more news than one page, or nothing loaded yet), it
 * replaces the list so there is never a silent gap.
 */
export function mergeNewestFirst<T extends { id: string }>(current: IdPage<T> | undefined, first: IdPage<T>): IdPage<T> {
  if (!current) return first
  const known = new Set(current.items.map((i) => i.id))
  if (current.items.length > 0 && !first.items.some((i) => known.has(i.id))) return first
  const fresh = first.items.filter((i) => !known.has(i.id))
  return { items: [...fresh, ...current.items], nextCursor: current.nextCursor }
}

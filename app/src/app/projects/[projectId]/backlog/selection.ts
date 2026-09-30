/**
 * Checkbox selection with shift-click ranges (pure). `orderedIds` is the
 * on-screen order across all sections; a range is taken from the anchor
 * (the last plain click) to the clicked item and set to the clicked item's
 * new state.
 */
export interface SelectionResult {
  selected: Set<string>
  anchor: string
}

export function toggleSelection(
  selected: ReadonlySet<string>,
  orderedIds: readonly string[],
  id: string,
  anchor: string | null,
  shift: boolean
): SelectionResult {
  const next = new Set(selected)
  const select = !selected.has(id)
  const from = anchor ? orderedIds.indexOf(anchor) : -1
  const to = orderedIds.indexOf(id)
  if (!shift || from < 0 || to < 0) {
    if (select) next.add(id)
    else next.delete(id)
    return { selected: next, anchor: id }
  }
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  for (const rangeId of orderedIds.slice(lo, hi + 1)) {
    if (select) next.add(rangeId)
    else next.delete(rangeId)
  }
  return { selected: next, anchor: anchor ?? id }
}

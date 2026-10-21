/**
 * Carry-over of unfinished sprint work into the next sprint. Pure; shared by
 * the create-sprint form (what to offer) and the server (what to copy), so the
 * list the user ticks and the rows that get copied are decided by one rule.
 *
 * A task is copied, not moved: the earlier sprint keeps its own record. The
 * copy points back at its original (SprintBacklogItem.carriedFromId); an
 * original that has a copy is "taken over" and is left out of every rule below
 * (callers filter those rows out with `withoutTakenOver` first).
 */

/** The fields of a sprint row the rule reads. */
export interface CarryRow {
  pbId: string
  /** Null / blank = a placeholder row that only marks the PBI's membership. */
  taskName: string | null
  status: string
}

export interface CarryGroup<T> {
  pbId: string
  /**
   * The rows to copy: the PBI's real tasks that are not done — or, for a PBI
   * without any real task yet, its (first) placeholder row, so that the
   * membership carries over too.
   */
  tasks: T[]
  /** The PBI has no real task yet. */
  placeholder: boolean
}

const isReal = (row: Pick<CarryRow, "taskName">) => (row.taskName ?? "").trim().length > 0

/**
 * Per PBI, what is left unfinished in a sprint, in first-seen order. A PBI is
 * unfinished when it has no real task yet or some real task is not done — the
 * same test as the completion dialog's "unfinished PBIs" count. A PBI whose
 * tasks are all done is not listed.
 */
export function unfinishedByPbi<T>(rows: readonly T[], read: (row: T) => CarryRow): CarryGroup<T>[] {
  const order: string[] = []
  const byPbi = new Map<string, T[]>()
  for (const row of rows) {
    const { pbId } = read(row)
    if (!byPbi.has(pbId)) order.push(pbId)
    byPbi.set(pbId, [...(byPbi.get(pbId) ?? []), row])
  }
  return order.flatMap((pbId): CarryGroup<T>[] => {
    const all = byPbi.get(pbId) ?? []
    const real = all.filter((r) => isReal(read(r)))
    if (real.length === 0) return [{ pbId, tasks: all.slice(0, 1), placeholder: true }]
    const open = real.filter((r) => read(r).status !== "done")
    return open.length > 0 ? [{ pbId, tasks: open, placeholder: false }] : []
  })
}

/** Rows that have no copy in a later sprint (a row whose id is in `takenOverIds` was already carried over). */
export function withoutTakenOver<T extends { id: string }>(rows: readonly T[], takenOverIds: ReadonlySet<string>): T[] {
  return rows.filter((r) => !takenOverIds.has(r.id))
}

/** States a sprint can be carried over from: ended, or in review (it may be created while one is in review). */
export const CARRY_SOURCE_STATUSES: readonly string[] = ["review", "done", "archived"]

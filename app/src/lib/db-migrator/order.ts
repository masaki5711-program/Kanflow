/**
 * Copy order from the target's foreign keys (the PostgreSQL schema Prisma
 * created is the authority, not a hand-kept list).
 *
 * Parents are copied before children. FKs that make the graph cyclic are
 * "deferred": the column is inserted as NULL and filled by an UPDATE after
 * every table is copied (two-phase). Self-references (trees such as
 * PlanItem.parentId) are always deferred - ordering the rows of one table
 * topologically would not work with keyset batches. A cycle can only be broken
 * on a nullable FK; a cycle of NOT NULL FKs is refused (it could not hold data
 * in PostgreSQL with non-deferrable constraints either).
 */
import { MigratorError } from "./errors"

export interface FkEdge {
  name: string
  /** child table (holds the FK columns) */
  table: string
  columns: string[]
  refTable: string
  refColumns: string[]
  /** all FK columns are nullable */
  nullable: boolean
}

export interface CopyPlan {
  order: string[]
  deferred: FkEdge[]
}

const byName = (a: FkEdge, b: FkEdge): number => (a.table === b.table ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.table < b.table ? -1 : 1)

/** Tarjan's strongly connected components over child -> parent edges. */
function stronglyConnected(tables: readonly string[], edges: readonly FkEdge[]): string[][] {
  const adj = new Map<string, string[]>(tables.map((t) => [t, []]))
  for (const e of edges) adj.get(e.table)?.push(e.refTable)
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const out: string[][] = []
  let counter = 0
  const visit = (v: string): void => {
    index.set(v, counter)
    low.set(v, counter)
    counter++
    stack.push(v)
    onStack.add(v)
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!))
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      out.push(comp.sort())
    }
  }
  for (const t of [...tables].sort()) if (!index.has(t)) visit(t)
  return out
}

export function planCopyOrder(tables: readonly string[], fks: readonly FkEdge[]): CopyPlan {
  const known = new Set(tables)
  for (const e of fks) {
    for (const t of [e.table, e.refTable]) {
      if (!known.has(t)) throw new MigratorError("FK_UNKNOWN_TABLE", `foreign key ${e.name} references table ${t}, which is not copied`)
    }
  }
  const deferred: FkEdge[] = []
  let remaining: FkEdge[] = []
  for (const e of [...fks].sort(byName)) {
    if (e.table !== e.refTable) {
      remaining.push(e)
      continue
    }
    if (!e.nullable) throw new MigratorError("FK_CYCLE_UNBREAKABLE", `self-reference ${e.name} on ${e.table} is NOT NULL`)
    deferred.push(e)
  }

  for (;;) {
    const cycles = stronglyConnected(tables, remaining).filter((c) => c.length > 1)
    if (cycles.length === 0) break
    for (const comp of cycles) {
      const members = new Set(comp)
      const candidate = remaining.find((e) => e.nullable && members.has(e.table) && members.has(e.refTable))
      if (!candidate) {
        throw new MigratorError("FK_CYCLE_UNBREAKABLE", `foreign-key cycle without a nullable edge between tables ${comp.join(", ")}`)
      }
      deferred.push(candidate)
      remaining = remaining.filter((e) => e !== candidate)
    }
  }

  // Kahn's algorithm; ready tables are taken alphabetically so the order is stable.
  const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]))
  const children = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]))
  for (const e of remaining) {
    parents.get(e.table)!.add(e.refTable)
    children.get(e.refTable)!.add(e.table)
  }
  const ready = tables.filter((t) => parents.get(t)!.size === 0).sort()
  const order: string[] = []
  while (ready.length > 0) {
    const t = ready.shift()!
    order.push(t)
    for (const c of [...children.get(t)!].sort()) {
      const p = parents.get(c)!
      p.delete(t)
      if (p.size === 0) {
        ready.push(c)
        ready.sort()
      }
    }
  }
  if (order.length !== tables.length) {
    // Unreachable after the SCC pass; kept as a hard stop rather than a silent partial order.
    throw new MigratorError("FK_CYCLE_UNBREAKABLE", "could not order tables (residual cycle)")
  }
  return { order, deferred }
}

import type { Db } from "./db"

/**
 * Best-effort statements inside a caller's transaction (activity rows,
 * notifications, translation enqueues).
 *
 * MySQL rolled back only the failed STATEMENT, so `try { await tx.x() } catch {}`
 * left the transaction usable. PostgreSQL aborts the whole transaction on any
 * error: every later statement fails with 25P02 and the commit rolls back the
 * user's write too. `bestEffort` runs `fn` under a SAVEPOINT when `db` is a
 * transaction client and rolls back to it on failure, so the caller's catch
 * keeps working as before. The error is re-thrown unchanged - swallowing and
 * logging stays with the caller.
 *
 * On the global client (no open transaction) every statement autocommits on
 * its own and there is nothing to protect: `fn` runs as is.
 */
let counter = 0

/**
 * True for an interactive-transaction client: the global PrismaClient has
 * $transaction, a `tx` does not. Partial test doubles without raw-SQL support
 * are treated like the global client (they model no transaction).
 */
function needsSavepoint(db: Db): boolean {
  const d = db as { $transaction?: unknown; $executeRawUnsafe?: unknown }
  return typeof d.$transaction !== "function" && typeof d.$executeRawUnsafe === "function"
}

export async function bestEffort<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  if (!needsSavepoint(db)) return fn()
  counter = (counter + 1) % 1_000_000
  // Static identifier from a counter, never input: safe to inline.
  const name = `kanflow_be_${counter}`
  await db.$executeRawUnsafe(`SAVEPOINT ${name}`)
  try {
    const out = await fn()
    await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`)
    return out
  } catch (err) {
    // If even the rollback fails the connection is gone and the transaction
    // fails on its own; the original error is the one worth reporting.
    await db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => undefined)
    throw err
  }
}

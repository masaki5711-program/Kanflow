import { logger } from "@/lib/logger"
import type { Db } from "./db"

const log = logger.child({ module: "savepoint" })

/**
 * Best-effort statements inside a caller's transaction (activity rows and
 * lookups, notifications, translation enqueues, reaction double clicks).
 *
 * MySQL rolled back only the failed STATEMENT, so `try { await tx.x() } catch {}`
 * left the transaction usable. PostgreSQL aborts the whole transaction on any
 * error: every later statement fails with 25P02 and the commit rolls back the
 * user's write too. `bestEffort` runs `fn` under a SAVEPOINT when `db` is a
 * transaction client and rolls back to it on failure, so the caller's catch
 * keeps working as before. The error is re-thrown unchanged - swallowing and
 * logging stays with the caller.
 *
 * If the ROLLBACK TO SAVEPOINT itself fails, the transaction is unusable:
 * that is logged (module "savepoint", the savepoint name) and thrown as a
 * SavepointRollbackError (cause = the original error) so the caller's
 * transaction fails visibly instead of committing nothing silently. Callers
 * that swallow errors must let SavepointRollbackError through (isFatalTxError).
 *
 * Calls on ONE transaction must be sequential (await each one): a transaction
 * is one connection, and interleaved savepoints would roll back each other's
 * work. Never wrap them in Promise.all.
 *
 * On the global client (no open transaction) every statement autocommits on
 * its own and there is nothing to protect: `fn` runs as is.
 */
let counter = 0

/** The savepoint could not be rolled back: the surrounding transaction must fail. */
export class SavepointRollbackError extends Error {
  readonly savepoint: string
  constructor(savepoint: string, cause: unknown) {
    super(`ROLLBACK TO SAVEPOINT ${savepoint} failed; the transaction is unusable`, { cause })
    this.name = "SavepointRollbackError"
    this.savepoint = savepoint
  }
}

/** True for errors a best-effort caller must NOT swallow. */
export function isFatalTxError(err: unknown): boolean {
  return err instanceof SavepointRollbackError
}

/**
 * True for an interactive-transaction client: the global PrismaClient has
 * $transaction, a `tx` does not. Partial test doubles without raw-SQL support
 * are treated like the global client (they model no transaction).
 */
function needsSavepoint(db: Db): boolean {
  const d = db as { $transaction?: unknown; $executeRawUnsafe?: unknown }
  return typeof d.$transaction !== "function" && typeof d.$executeRawUnsafe === "function"
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function bestEffort<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  if (!needsSavepoint(db)) return fn()
  counter = (counter + 1) % 1_000_000
  // Static identifier from a counter, never input: safe to inline.
  const name = `kanflow_be_${counter}`
  await db.$executeRawUnsafe(`SAVEPOINT ${name}`)
  let out: T
  try {
    out = await fn()
  } catch (err) {
    try {
      await db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`)
    } catch (rollbackErr) {
      log.error("rollback to savepoint failed; the transaction is unusable", { savepoint: name, error: message(rollbackErr), cause: message(err) })
      throw new SavepointRollbackError(name, err)
    }
    throw err
  }
  await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`)
  return out
}

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { runWithCommitScope } from "@/lib/realtime/after-commit"

/**
 * The client every repository function takes as its first argument: either
 * the global Prisma client or the `tx` of an interactive transaction. This
 * lets services compose repository calls into one transaction.
 */
export type Db = Prisma.TransactionClient

/** The global client, typed as `Db` for default arguments. */
export const defaultDb: Db = prisma

/**
 * Interactive-transaction limits. The pool has only 5 connections, so waiting
 * for one is capped; the body gets more than Prisma's 5 s default because
 * bulk operations (reorder, project delete with translation cleanup) run
 * many short statements sequentially.
 */
const TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const

/**
 * Interactive transaction wrapper (single seam for tests to mock). Real-time
 * events published inside the body (`publishAfterCommit`) go out only after
 * the commit and are dropped on rollback (lib/realtime/after-commit.ts).
 */
export function withTransaction<T>(fn: (tx: Db) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
  return runWithCommitScope(() => prisma.$transaction((tx) => fn(tx), { ...TX_OPTIONS, ...options }))
}

export interface TransactionOptions {
  /**
   * "ReadCommitted": every statement reads the latest committed rows instead of the
   * snapshot taken at the transaction's first read (MariaDB's default REPEATABLE
   * READ). Needed when a row lock serializes a check-then-insert (work claims):
   * the reads after the lock must see what the previous lock holder committed.
   */
  isolationLevel?: "ReadCommitted"
}

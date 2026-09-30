import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

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

/** Interactive transaction wrapper (single seam for tests to mock). */
export function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => fn(tx), TX_OPTIONS)
}

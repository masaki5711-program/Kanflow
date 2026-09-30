/**
 * Shared mocks for service unit tests (not a test file itself).
 *
 *   vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
 *   vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
 *   vi.mock("../x.repository")            // automock: every export is a vi.fn()
 *
 * `withTransaction(fn)` runs `fn(TX)` so tests can assert that repository
 * and translation calls received the transaction client.
 */
import { vi } from "vitest"
import { pickTranslatableFields } from "@/lib/translation/pick-fields"
import type { TranslatableEntity } from "@/lib/translation/types"
import type { Actor } from "@/services/_shared/actor"

export const TX = Object.freeze({ __tx: true })
export const DEFAULT_DB = Object.freeze({ __default: true })

export const ACTOR: Actor = { userId: "u1", userName: "Alice", systemRole: "member" }

export function dbMock() {
  return {
    defaultDb: DEFAULT_DB,
    withTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)),
  }
}

type Row = Record<string, unknown>

export function translationMock() {
  return {
    prepareText: vi.fn(async <T>(data: T) => data),
    enqueueIn: vi.fn(async () => undefined),
    purgeIn: vi.fn(async () => 0),
    attachI18n: vi.fn(async (_type: string, rows: Row[]) => rows.map((r) => ({ ...r, i18n: {} }))),
    attachI18nOne: vi.fn(async (_type: string, row: Row) => ({ ...row, i18n: {} })),
    getI18nFor: vi.fn(async () => new Map()),
  }
}

/**
 * The translation fields the REAL enqueue would touch (upsert or delete) for
 * every recorded `enqueueIn(tx, entityType, id, record)` call of the mocked
 * seam — `[]` means the write leaves every FieldTranslation row alone.
 */
export function touchedTranslationFields(enqueueIn: unknown, entityType?: TranslatableEntity): string[] {
  const calls = (enqueueIn as { mock: { calls: unknown[][] } }).mock.calls
  return calls
    .filter((c) => entityType === undefined || c[1] === entityType)
    .flatMap((c) => Object.keys(pickTranslatableFields(c[1] as TranslatableEntity, c[3] as Record<string, unknown>)))
}

/**
 * Inert activity seam: `logUpdate` reports the changed fields computed from
 * the given before/after (so notification triggers can be tested), without a DB.
 */
export async function activityMock() {
  const real = await vi.importActual<typeof import("@/services/_shared/activity")>("@/services/_shared/activity")
  return {
    ...real,
    logActivity: vi.fn(async () => undefined),
    logCreate: vi.fn(async () => undefined),
    logDelete: vi.fn(async () => undefined),
    logUpdate: vi.fn(async (_tx: unknown, ref: { entityType: string; before: Row | null; after: Row }) =>
      ref.before ? real.diffFields(ref.before, ref.after, real.TRACKED_FIELDS[ref.entityType as keyof typeof real.TRACKED_FIELDS]) : {}
    ),
    loadSnapshot: vi.fn(async () => null),
  }
}

/** Inert notification seam. */
export function notificationsMock() {
  return {
    notify: vi.fn(async () => 0),
    projectMemberIds: vi.fn(async () => [] as string[]),
    resolveAssigneeUserIds: vi.fn(async () => [] as string[]),
    newlyAssignedUserIds: vi.fn(async () => [] as string[]),
  }
}

/** A Prisma-like known request error. */
export function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(`prisma ${code}`), { code })
}

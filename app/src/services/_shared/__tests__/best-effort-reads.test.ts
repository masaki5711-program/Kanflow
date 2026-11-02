import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => {
  const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: { child: () => log } }
})

import { loadSnapshot, logActivity } from "../activity"
import { notify, projectMemberIds, resolveAssigneeUserIds } from "../notifications"

/**
 * "Never throws" READS on the caller's transaction (activity snapshots / parent
 * lookups, notification recipient lookups) must run under a savepoint too: on
 * PostgreSQL a failed read aborts the whole transaction just like a failed write.
 */
function failingTx() {
  const statements: string[] = []
  const boom = vi.fn(async () => {
    throw new Error("canceling statement due to statement timeout")
  })
  const tx = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      statements.push(sql)
      return 0
    }),
    productBacklogItem: { findUnique: boom },
    sprintBacklogItem: { findUnique: boom },
    releaseBacklogItem: { findUnique: boom },
    projectMember: { findMany: boom },
    user: { findMany: boom },
    activityLog: { create: vi.fn(async () => ({})) },
  }
  return { tx: tx as never, statements }
}

const rolledBack = (statements: string[]) => statements.some((s) => s.startsWith("ROLLBACK TO SAVEPOINT"))

describe("best-effort reads on a transaction use a savepoint", () => {
  it("loadSnapshot: null on failure, rolled back to its savepoint", async () => {
    const { tx, statements } = failingTx()
    await expect(loadSnapshot(tx, "pbi", "b1")).resolves.toBeNull()
    expect(rolledBack(statements)).toBe(true)
  })

  it("logActivity's parent lookup (sprint_task) is protected and the row is still written", async () => {
    const { tx, statements } = failingTx()
    await logActivity(tx, { projectId: "p1", entityType: "sprint_task", entityId: "t1", action: "update", actor: null })
    expect(rolledBack(statements)).toBe(true)
    expect((tx as unknown as { activityLog: { create: ReturnType<typeof vi.fn> } }).activityLog.create).toHaveBeenCalledTimes(1)
  })

  it("projectMemberIds / resolveAssigneeUserIds: [] on failure, rolled back", async () => {
    const a = failingTx()
    await expect(projectMemberIds(a.tx, "p1")).resolves.toEqual([])
    expect(rolledBack(a.statements)).toBe(true)
    const b = failingTx()
    await expect(resolveAssigneeUserIds(b.tx, "p1", "Taro")).resolves.toEqual([])
    expect(rolledBack(b.statements)).toBe(true)
  })

  it("notify's recipient lookup: 0 on failure, rolled back", async () => {
    const { tx, statements } = failingTx()
    await expect(notify(tx, { type: "assigned", recipientIds: ["u2"], actorId: "u1", projectId: "p1" } as never)).resolves.toBe(0)
    expect(rolledBack(statements)).toBe(true)
  })
})

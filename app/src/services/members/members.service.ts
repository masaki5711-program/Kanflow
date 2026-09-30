import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import * as repo from "./members.repository"
import type { MemberRole } from "./members.schemas"

const LAST_PO_DEMOTE = "最後のPOを降格することはできません。先に別のメンバーをPOに昇格してください。"
const LAST_PO_REMOVE = "最後のPOを削除することはできません。先に別のメンバーをPOに昇格してください。"

/** Pure rule: a project must always keep at least one PO. */
export function losesLastPo(currentRole: string | undefined, nextRole: string | null, poCount: number): boolean {
  return currentRole === "po" && nextRole !== "po" && poCount <= 1
}

export function listMembers(projectId: string) {
  return repo.findMembers(defaultDb, projectId)
}

/**
 * Bulk add: inactive / unknown users and existing members are skipped.
 * `added === 0` means nothing was inserted (the route answers 200, else 201).
 */
export async function addMembersBulk(projectId: string, userIds: readonly string[], role: MemberRole) {
  return withTransaction(async (tx) => {
    const valid = (await repo.findActiveUserIds(tx, userIds)).map((u) => u.id)
    const existing = new Set((await repo.findMemberUserIds(tx, projectId, valid)).map((m) => m.userId))
    const toInsert = valid.filter((id) => !existing.has(id))
    if (toInsert.length === 0) return { added: 0, skipped: userIds.length }
    await repo.insertMembers(tx, projectId, toInsert, role)
    const created = await repo.findMembersByUserIds(tx, projectId, toInsert)
    return { added: created.length, skipped: userIds.length - created.length, members: created }
  })
}

export async function addMember(projectId: string, key: { userId?: string; email?: string }, role: MemberRole) {
  const user = await repo.findUserByIdOrEmail(defaultDb, key)
  if (!user) throw new NotFoundError("ユーザーが見つかりません", {}, "USER_NOT_FOUND")
  if (!user.isActive) throw new ValidationError("無効化されたユーザーです", {}, "USER_INACTIVE")
  if (await repo.findMembership(defaultDb, projectId, user.id)) throw new ConflictError("既にメンバーです", {}, "MEMBER_EXISTS")
  return repo.insertMember(defaultDb, projectId, user.id, role)
}

interface LastPoRule {
  message: string
  code: "LAST_PO_DEMOTE" | "LAST_PO_REMOVE"
}

async function assertKeepsPo(tx: Db, projectId: string, memberId: string, nextRole: string | null, rule: LastPoRule) {
  const target = await repo.findMemberRole(tx, projectId, memberId)
  if (target?.role !== "po" || nextRole === "po") return
  if (losesLastPo(target.role, nextRole, await repo.countPos(tx, projectId))) throw new ValidationError(rule.message, {}, rule.code)
}

export async function changeMemberRole(projectId: string, memberId: string, role: MemberRole) {
  return withTransaction(async (tx) => {
    await assertKeepsPo(tx, projectId, memberId, role, { message: LAST_PO_DEMOTE, code: "LAST_PO_DEMOTE" })
    return repo.updateMemberRole(tx, projectId, memberId, role)
  })
}

export async function removeMember(projectId: string, memberId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await assertKeepsPo(tx, projectId, memberId, null, { message: LAST_PO_REMOVE, code: "LAST_PO_REMOVE" })
    await repo.deleteMember(tx, projectId, memberId)
  })
}

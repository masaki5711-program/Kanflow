import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logCreate, logDelete, logUpdate } from "@/services/_shared/activity"
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
interface MemberRow {
  id: string
  userId: string
  role: string
  user?: { name?: string | null } | null
}

/** "create" of a membership, labelled by the user's name. */
function logMemberAdded(db: Db, projectId: string, member: MemberRow, actor: Actor | null) {
  return logCreate(db, {
    projectId,
    entityType: "member",
    entityId: member.id,
    actor,
    row: { userId: member.userId, role: member.role },
    meta: { userName: member.user?.name ?? null },
  })
}

export async function addMembersBulk(projectId: string, userIds: readonly string[], role: MemberRole, actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    const valid = (await repo.findActiveUserIds(tx, userIds)).map((u) => u.id)
    const existing = new Set((await repo.findMemberUserIds(tx, projectId, valid)).map((m) => m.userId))
    const toInsert = valid.filter((id) => !existing.has(id))
    if (toInsert.length === 0) return { added: 0, skipped: userIds.length }
    await repo.insertMembers(tx, projectId, toInsert, role)
    const created = await repo.findMembersByUserIds(tx, projectId, toInsert)
    for (const m of created) await logMemberAdded(tx, projectId, m, actor)
    return { added: created.length, skipped: userIds.length - created.length, members: created }
  })
}

export async function addMember(
  projectId: string,
  key: { userId?: string; email?: string },
  role: MemberRole,
  actor: Actor | null = null
) {
  const user = await repo.findUserByIdOrEmail(defaultDb, key)
  if (!user) throw new NotFoundError("ユーザーが見つかりません", {}, "USER_NOT_FOUND")
  if (!user.isActive) throw new ValidationError("無効化されたユーザーです", {}, "USER_INACTIVE")
  if (await repo.findMembership(defaultDb, projectId, user.id)) throw new ConflictError("既にメンバーです", {}, "MEMBER_EXISTS")
  const member = await repo.insertMember(defaultDb, projectId, user.id, role)
  await logMemberAdded(defaultDb, projectId, member, actor)
  return member
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

export async function changeMemberRole(projectId: string, memberId: string, role: MemberRole, actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    await assertKeepsPo(tx, projectId, memberId, role, { message: LAST_PO_DEMOTE, code: "LAST_PO_DEMOTE" })
    const before = await loadSnapshot(tx, "member", memberId)
    const updated = await repo.updateMemberRole(tx, projectId, memberId, role)
    const meta = { userName: updated.user?.name ?? null }
    await logUpdate(tx, { projectId, entityType: "member", entityId: memberId, actor, before, after: updated, meta })
    return updated
  })
}

export async function removeMember(projectId: string, memberId: string, actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    await assertKeepsPo(tx, projectId, memberId, null, { message: LAST_PO_REMOVE, code: "LAST_PO_REMOVE" })
    const row = await loadSnapshot(tx, "member", memberId)
    await repo.deleteMember(tx, projectId, memberId)
    await logDelete(tx, { projectId, entityType: "member", entityId: memberId, actor, row })
  })
}

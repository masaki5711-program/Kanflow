import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

const MEMBER_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  employeeNumber: true,
  department: true,
} as const

export function findMembers(db: Db, projectId: string) {
  return db.projectMember.findMany({
    where: { projectId },
    include: { user: { select: MEMBER_USER_SELECT } },
    orderBy: { joinedAt: "asc" },
    take: LIST_LIMITS.projectMembers,
  })
}

export function findActiveUserIds(db: Db, userIds: readonly string[]) {
  return db.user.findMany({ where: { id: { in: [...userIds] }, isActive: true }, select: { id: true } })
}

export function findMemberUserIds(db: Db, projectId: string, userIds: readonly string[]) {
  return db.projectMember.findMany({
    where: { projectId, userId: { in: [...userIds] } },
    select: { userId: true },
  })
}

export function insertMembers(db: Db, projectId: string, userIds: readonly string[], role: string) {
  return db.projectMember.createMany({ data: userIds.map((userId) => ({ projectId, userId, role })) })
}

export function findMembersByUserIds(db: Db, projectId: string, userIds: readonly string[]) {
  return db.projectMember.findMany({
    where: { projectId, userId: { in: [...userIds] } },
    include: { user: { select: MEMBER_USER_SELECT } },
  })
}

export function findUserByIdOrEmail(db: Db, key: { userId?: string; email?: string }) {
  const select = { id: true, isActive: true } as const
  return key.userId
    ? db.user.findUnique({ where: { id: key.userId }, select })
    : db.user.findUnique({ where: { email: key.email ?? "" }, select })
}

export function findMembership(db: Db, projectId: string, userId: string) {
  return db.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } })
}

export function insertMember(db: Db, projectId: string, userId: string, role: string) {
  return db.projectMember.create({
    data: { projectId, userId, role },
    include: { user: { select: MEMBER_USER_SELECT } },
  })
}

export function findMemberRole(db: Db, projectId: string, memberId: string) {
  return db.projectMember.findFirst({ where: { id: memberId, projectId }, select: { role: true } })
}

export function countPos(db: Db, projectId: string) {
  return db.projectMember.count({ where: { projectId, role: "po" } })
}

export function updateMemberRole(db: Db, projectId: string, memberId: string, role: string) {
  return db.projectMember.update({
    where: { id: memberId, projectId },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
}

export function deleteMember(db: Db, projectId: string, memberId: string) {
  return db.projectMember.delete({ where: { id: memberId, projectId } })
}

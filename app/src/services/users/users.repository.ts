import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

const SECTIONS = { sections: { include: { section: { select: { id: true, name: true } } } } } as const

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  employeeNumber: true,
  department: true,
  ...SECTIONS,
} as const

export const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  employeeNumber: true,
  department: true,
  role: true,
  language: true,
} as const

export function findUsersForAdmin(db: Db) {
  return db.user.findMany({
    select: { ...ADMIN_USER_SELECT, createdAt: true, _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMITS.users,
  })
}

/** Another user already holding the email / employee number (null when free). */
export function findUserWith(db: Db, where: { email?: string; employeeNumber?: string }, excludeId?: string) {
  return db.user.findFirst({
    where: { ...where, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  })
}

export function insertUser(db: Db, data: Prisma.UserCreateInput) {
  return db.user.create({ data, select: { ...ADMIN_USER_SELECT, createdAt: true } })
}

export function updateUser(db: Db, id: string, data: Prisma.UserUpdateInput) {
  return db.user.update({ where: { id }, data, select: { id: true } })
}

export async function replaceUserSections(db: Db, userId: string, sectionIds: readonly string[]): Promise<void> {
  await db.userSection.deleteMany({ where: { userId } })
  if (sectionIds.length > 0) {
    await db.userSection.createMany({ data: sectionIds.map((sectionId) => ({ userId, sectionId })) })
  }
}

export function findUserForAdmin(db: Db, id: string) {
  return db.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT })
}

export function setPassword(db: Db, id: string, hash: string) {
  return db.user.update({ where: { id }, data: { password: hash }, select: { id: true } })
}

/** Admin reset: new hash + tokenVersion bump so every existing session ends. */
export function setPasswordAndRevokeSessions(db: Db, id: string, hash: string) {
  return db.user.update({
    where: { id },
    data: { password: hash, tokenVersion: { increment: 1 } },
    select: { id: true },
  })
}

/** The fields whose change revokes sessions (null when the user does not exist). */
export function findAuthFields(db: Db, id: string) {
  return db.user.findUnique({ where: { id }, select: { role: true, isActive: true } })
}

export function findPasswordHash(db: Db, id: string) {
  return db.user.findUnique({ where: { id }, select: { password: true } })
}

export function findProfile(db: Db, id: string) {
  return db.user.findUnique({ where: { id }, select: PROFILE_SELECT })
}

export function updateProfile(db: Db, id: string, data: Prisma.UserUpdateInput) {
  return db.user.update({ where: { id }, data, select: PROFILE_SELECT })
}

export function findLanguage(db: Db, id: string) {
  return db.user.findUnique({ where: { id }, select: { language: true } })
}

export function setLanguage(db: Db, id: string, language: string) {
  return db.user.update({ where: { id }, data: { language }, select: { language: true } })
}

export function searchActiveUsers(db: Db, q: string, excludeProjectId: string | undefined) {
  return db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
        { employeeNumber: { contains: q } },
        { department: { contains: q } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      employeeNumber: true,
      department: true,
      memberships: excludeProjectId ? { where: { projectId: excludeProjectId }, select: { id: true } } : false,
    },
    orderBy: [{ name: "asc" }],
    take: LIST_LIMITS.userSearch,
  })
}

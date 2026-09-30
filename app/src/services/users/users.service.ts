import bcrypt from "bcryptjs"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { ConflictError, ValidationError } from "@/services/_shared/errors"
import * as repo from "./users.repository"
import { normalizeOptional, type CreateUserInput, type UpdateUserInput } from "./users.schemas"

/** bcrypt cost for stored password hashes. */
export const PASSWORD_HASH_ROUNDS = 12

const EMAIL_TAKEN = "このメールアドレスは既に使用されています"
export const EMPLOYEE_NUMBER_TAKEN = "この従業員番号は既に使用されています"

type WithSections<T> = T & { sections: ReadonlyArray<{ section: { id: string; name: string } }> }

function flattenSections<T>(user: WithSections<T>) {
  return { ...user, sections: user.sections.map((s) => s.section) }
}

export async function listUsers() {
  return (await repo.findUsersForAdmin(defaultDb)).map(flattenSections)
}

export async function createUser(input: CreateUserInput) {
  const employeeNumber = normalizeOptional(input.employeeNumber) ?? null
  const department = normalizeOptional(input.department) ?? null
  if (await repo.findUserWith(defaultDb, { email: input.email })) throw new ConflictError(EMAIL_TAKEN, {}, "EMAIL_TAKEN")
  if (employeeNumber && (await repo.findUserWith(defaultDb, { employeeNumber }))) {
    throw new ConflictError(EMPLOYEE_NUMBER_TAKEN, {}, "EMPLOYEE_NUMBER_TAKEN")
  }
  const user = await repo.insertUser(defaultDb, {
    name: input.name,
    email: input.email,
    password: await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS),
    role: input.role,
    employeeNumber,
    department,
    sections: input.sectionIds?.length
      ? { create: input.sectionIds.map((sectionId) => ({ section: { connect: { id: sectionId } } })) }
      : undefined,
  })
  return flattenSections(user)
}

/** Pure: admins cannot lock themselves out (deactivate / drop admin role on self). */
export function selfLockoutError(actorId: string, targetId: string, input: UpdateUserInput): ValidationError | null {
  if (actorId !== targetId) return null
  if (input.isActive === false) return new ValidationError("自分自身を無効化することはできません", {}, "CANNOT_DEACTIVATE_SELF")
  if (input.role && input.role !== "admin") return new ValidationError("自分自身の管理者権限を外すことはできません", {}, "CANNOT_DEMOTE_SELF")
  return null
}

async function assertUniqueFields(id: string, email: string | undefined, employeeNumber: string | null | undefined) {
  if (email && (await repo.findUserWith(defaultDb, { email }, id))) throw new ConflictError(EMAIL_TAKEN, {}, "EMAIL_TAKEN")
  if (typeof employeeNumber === "string" && (await repo.findUserWith(defaultDb, { employeeNumber }, id))) {
    throw new ConflictError(EMPLOYEE_NUMBER_TAKEN, {}, "EMPLOYEE_NUMBER_TAKEN")
  }
}

export async function updateUser(actorId: string, id: string, input: UpdateUserInput) {
  const lockout = selfLockoutError(actorId, id, input)
  if (lockout) throw lockout
  const employeeNumber = normalizeOptional(input.employeeNumber)
  const department = normalizeOptional(input.department)
  await assertUniqueFields(id, input.email, employeeNumber)

  const { sectionIds, name, email, role, isActive } = input
  await withTransaction(async (tx) => {
    await repo.updateUser(tx, id, {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(employeeNumber !== undefined ? { employeeNumber } : {}),
      ...(department !== undefined ? { department } : {}),
    })
    if (sectionIds !== undefined) await repo.replaceUserSections(tx, id, sectionIds)
  })
  const user = await repo.findUserForAdmin(defaultDb, id)
  return { ...user, sections: user?.sections.map((s) => s.section) ?? [] }
}

export async function resetPassword(id: string, password: string): Promise<void> {
  await repo.setPassword(defaultDb, id, await bcrypt.hash(password, PASSWORD_HASH_ROUNDS))
}

import bcrypt from "bcryptjs"
import { defaultDb } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import * as repo from "./users.repository"
import { normalizeOptional, type UiLanguage, type UpdateProfileInput } from "./users.schemas"
import { EMPLOYEE_NUMBER_TAKEN, PASSWORD_HASH_ROUNDS } from "./users.service"

/** Self-service: the signed-in user's own profile, language and password. */

export async function getProfile(userId: string) {
  const user = await repo.findProfile(defaultDb, userId)
  if (!user) throw new NotFoundError()
  return user
}

/** Name / employee number / department only; email and role need an admin. */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const employeeNumber = normalizeOptional(input.employeeNumber)
  const department = normalizeOptional(input.department)
  if (typeof employeeNumber === "string" && (await repo.findUserWith(defaultDb, { employeeNumber }, userId))) {
    throw new ConflictError(EMPLOYEE_NUMBER_TAKEN, {}, "EMPLOYEE_NUMBER_TAKEN")
  }
  return repo.updateProfile(defaultDb, userId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(employeeNumber !== undefined ? { employeeNumber } : {}),
    ...(department !== undefined ? { department } : {}),
  })
}

export async function getLanguage(userId: string): Promise<{ language: string }> {
  const user = await repo.findLanguage(defaultDb, userId)
  return { language: user?.language ?? "ja" }
}

export function setLanguage(userId: string, language: UiLanguage) {
  return repo.setLanguage(defaultDb, userId, language)
}

/**
 * Verify the current password and store the new one. Returns
 * "wrong_password" (the route counts it for rate limiting) instead of throwing.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<"ok" | "wrong_password"> {
  const user = await repo.findPasswordHash(defaultDb, userId)
  if (!user) throw new NotFoundError()
  if (!(await bcrypt.compare(currentPassword, user.password))) return "wrong_password"
  await repo.setPassword(defaultDb, userId, await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS))
  return "ok"
}

/** Typeahead: active users matching name / email / employee number / department (max 20). */
export async function searchUsers(q: string, excludeProjectId: string | undefined) {
  if (q.length < 1) return []
  const users = await repo.searchActiveUsers(defaultDb, q, excludeProjectId)
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    employeeNumber: u.employeeNumber,
    department: u.department,
    isMember: excludeProjectId ? (u.memberships?.length ?? 0) > 0 : false,
  }))
}

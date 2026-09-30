import { z } from "zod"

/**
 * Minimum length of a NEW password (create / admin reset / own change), A3-18.
 * Login is not length-checked, so existing shorter passwords keep working.
 * Pure module: the forms import the same constant.
 */
export const MIN_PASSWORD_LENGTH = 8

export const SYSTEM_ROLE_VALUES = ["admin", "section_manager", "member"] as const
export const UI_LANGUAGES = ["ja", "en", "id"] as const

export const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: z.enum(SYSTEM_ROLE_VALUES),
  employeeNumber: z.string().max(50).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  sectionIds: z.array(z.string()).optional(),
})

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).optional(),
  role: z.enum(SYSTEM_ROLE_VALUES).optional(),
  isActive: z.boolean().optional(),
  employeeNumber: z.string().max(50).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  sectionIds: z.array(z.string()).optional(),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
})

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  employeeNumber: z.string().max(50).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
})

export const languageSchema = z.object({
  language: z.enum(UI_LANGUAGES),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type UiLanguage = (typeof UI_LANGUAGES)[number]

/** `undefined` stays undefined (not provided); null / blank → null; otherwise trimmed. */
export function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

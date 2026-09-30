import type { Translations } from "@/lib/i18n"
import { MIN_PASSWORD_LENGTH, type UserFormValues } from "./types"

export type UserFormErrors = Partial<Record<"name" | "email" | "password", string>>

type Messages = Pick<Translations, "userNameRequired" | "userEmailInvalid" | "userPasswordMinError">

/** Same shape rule as the browser's type=email check; the server re-validates (users.schemas.ts). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/

/**
 * Localized client-side checks (A3-18): the form uses `noValidate`, so the
 * browser's own (English) bubbles never show. Empty object = valid.
 */
export function validateUserForm(form: UserFormValues, isEdit: boolean, t: Messages): UserFormErrors {
  return {
    ...(form.name.trim() ? {} : { name: t.userNameRequired }),
    ...(EMAIL_RE.test(form.email.trim()) ? {} : { email: t.userEmailInvalid }),
    ...(isEdit || form.password.length >= MIN_PASSWORD_LENGTH ? {} : { password: t.userPasswordMinError }),
  }
}

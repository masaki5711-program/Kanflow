import { formatDateTime, formatLongDate } from "@/lib/format-date"
import type { Language } from "@/lib/i18n"

/** Wire shapes of /api/user/api-tokens and /api/admin/api-tokens (services/api-tokens). */
export interface ApiTokenView {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  state: "active" | "revoked" | "expired"
}

export interface OwnApiTokens {
  config: { enabled: boolean; maxPerUser: number; allowNoExpiry: boolean; expiryDays: number[] }
  tokens: ApiTokenView[]
}

export interface CreatedApiToken extends ApiTokenView {
  token: string
}

export interface AdminApiTokenView extends ApiTokenView {
  user: { id: string; name: string; email: string; isActive: boolean }
}

export interface AdminApiTokens {
  enabled: boolean
  tokens: AdminApiTokenView[]
}

/** Date (+ time) in the UI language via the app-wide helpers (A3-14); invalid input → "". */
export function formatTokenDate(iso: string, language: Language, withTime = false): string {
  return withTime ? formatDateTime(iso, language) : formatLongDate(iso, language)
}

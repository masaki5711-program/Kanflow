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

const LOCALE: Record<Language, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

/** Date (+ time) in the UI language; invalid input → "". */
export function formatTokenDate(iso: string, language: Language, withTime = false): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(LOCALE[language] ?? LOCALE.ja, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

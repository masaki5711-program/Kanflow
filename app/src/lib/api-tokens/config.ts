/**
 * Personal access token settings (env, read per call so tests and ops can
 * change them without a code path restart):
 *
 *   API_TOKENS_ENABLED         on (default) | off — off rejects every /api/v1
 *                              request and token creation (existing rows stay)
 *   API_TOKEN_MAX_PER_USER     active (not revoked, not expired) tokens per user, default 5
 *   API_TOKEN_ALLOW_NO_EXPIRY  false (default) | true — allow tokens without expiry
 *   API_V1_RATE_LIMIT_PER_MIN  requests per token per minute, default 120
 */

export const API_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const
export type ApiTokenExpiryDays = (typeof API_TOKEN_EXPIRY_DAYS)[number]

export interface ApiTokenConfig {
  enabled: boolean
  maxPerUser: number
  allowNoExpiry: boolean
  ratePerMinute: number
}

const DEFAULT_MAX_PER_USER = 5
const DEFAULT_RATE_PER_MINUTE = 120
const FALSY = new Set(["0", "false", "off", "no", "disabled"])
const TRUTHY = new Set(["1", "true", "on", "yes", "enabled"])

function flag(raw: string | undefined, fallback: boolean): boolean {
  const v = raw?.trim().toLowerCase()
  if (!v) return fallback
  if (FALSY.has(v)) return false
  if (TRUTHY.has(v)) return true
  return fallback
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export function loadApiTokenConfig(env: Readonly<Record<string, string | undefined>> = process.env): ApiTokenConfig {
  return {
    enabled: flag(env.API_TOKENS_ENABLED, true),
    maxPerUser: positiveInt(env.API_TOKEN_MAX_PER_USER, DEFAULT_MAX_PER_USER),
    allowNoExpiry: flag(env.API_TOKEN_ALLOW_NO_EXPIRY, false),
    ratePerMinute: positiveInt(env.API_V1_RATE_LIMIT_PER_MIN, DEFAULT_RATE_PER_MINUTE),
  }
}

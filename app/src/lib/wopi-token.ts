import crypto from "crypto"
import jwt from "jsonwebtoken"

/**
 * Per-file, per-user, short-lived WOPI access tokens.
 *
 * Collabora forwards the token verbatim on every WOPI call
 * (CheckFileInfo / GetFile / PutFile). Tokens are HS256 JWTs bound to a
 * single attachment and user, so a leaked token cannot open other files
 * and expires on its own.
 */

/** Collabora editing sessions are long; 10 hours covers a working day. */
export const WOPI_TOKEN_TTL_MS = 10 * 60 * 60 * 1000

const WOPI_AUDIENCE = "kanflow-wopi"
const WOPI_KEY_LABEL = "kanflow-wopi-token-v1"

export interface WopiTokenClaims {
  projectId: string
  attachmentId: string
  userId: string
  canWrite: boolean
}

export interface SignedWopiToken {
  token: string
  /** Absolute expiry, ms since epoch (WOPI `access_token_ttl` semantics). */
  expiresAt: number
}

/**
 * Derive the signing key from the configured secret. WOPI_ACCESS_TOKEN is
 * kept as the config knob for backward compatibility; AUTH_SECRET /
 * NEXTAUTH_SECRET are fallbacks. The raw env value is never used directly
 * as a key so the same secret cannot be replayed as a token.
 */
export function deriveWopiKey(secret: string): string {
  return crypto.createHmac("sha256", secret).update(WOPI_KEY_LABEL).digest("hex")
}

export function getWopiSigningKey(): string | null {
  const secret =
    process.env.WOPI_ACCESS_TOKEN || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  return secret ? deriveWopiKey(secret) : null
}

export function buildWopiFileId(projectId: string, attachmentId: string): string {
  return `${projectId}_${attachmentId}`
}

export function parseWopiFileId(
  fileId: string
): { projectId: string; attachmentId: string } | null {
  const underscore = fileId.indexOf("_")
  if (underscore <= 0 || underscore === fileId.length - 1) return null
  return {
    projectId: fileId.slice(0, underscore),
    attachmentId: fileId.slice(underscore + 1),
  }
}

export function signWopiToken(
  claims: WopiTokenClaims,
  key: string,
  nowMs: number = Date.now(),
  ttlMs: number = WOPI_TOKEN_TTL_MS
): SignedWopiToken {
  const iat = Math.floor(nowMs / 1000)
  const exp = Math.floor((nowMs + ttlMs) / 1000)
  const payload = {
    projectId: claims.projectId,
    attachmentId: claims.attachmentId,
    canWrite: claims.canWrite,
    sub: claims.userId,
    aud: WOPI_AUDIENCE,
    iat,
    exp,
  }
  const token = jwt.sign(payload, key, { algorithm: "HS256", noTimestamp: true })
  return { token, expiresAt: exp * 1000 }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/** Returns the claims when signature, audience, expiry and shape are valid; else null. */
export function verifyWopiToken(
  token: string | null | undefined,
  key: string,
  nowMs: number = Date.now()
): WopiTokenClaims | null {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, key, {
      algorithms: ["HS256"],
      audience: WOPI_AUDIENCE,
      clockTimestamp: Math.floor(nowMs / 1000),
    })
    if (typeof decoded !== "object" || decoded === null) return null
    const { projectId, attachmentId, sub, canWrite } = decoded as Record<string, unknown>
    if (!isNonEmptyString(projectId) || !isNonEmptyString(attachmentId)) return null
    if (!isNonEmptyString(sub) || typeof canWrite !== "boolean") return null
    return { projectId, attachmentId, userId: sub, canWrite }
  } catch {
    return null
  }
}

/** True when the WOPI fileId in the URL refers to the file the token was issued for. */
export function tokenMatchesFileId(claims: WopiTokenClaims, fileId: string): boolean {
  const parsed = parseWopiFileId(fileId)
  if (!parsed) return false
  return parsed.projectId === claims.projectId && parsed.attachmentId === claims.attachmentId
}

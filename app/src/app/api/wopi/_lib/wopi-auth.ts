import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  getWopiSigningKey,
  tokenMatchesFileId,
  verifyWopiToken,
  type WopiTokenClaims,
} from "@/lib/wopi-token"

export type WopiAuthResult = { claims: WopiTokenClaims } | { error: NextResponse }

function unauthorized(): { error: NextResponse } {
  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
}

/**
 * Verify the per-file access_token Collabora forwards on every WOPI call:
 * signature, expiry, and that it was issued for exactly this fileId.
 */
export function authenticateWopiRequest(request: Request, fileId: string): WopiAuthResult {
  const key = getWopiSigningKey()
  if (!key) return unauthorized()
  const token = new URL(request.url).searchParams.get("access_token")
  const claims = verifyWopiToken(token, key)
  if (!claims || !tokenMatchesFileId(claims, fileId)) return unauthorized()
  return { claims }
}

export interface WopiUserAccess {
  userId: string
  name: string
  canWrite: boolean
}

/**
 * Re-check the token user in the DB so revoked members / disabled users lose
 * access before the token expires. Mirrors requireProjectMember (active system
 * admin, or explicit project member — both may edit attachments).
 * Returns null when the user may no longer access the project at all.
 */
export async function loadWopiUserAccess(claims: WopiTokenClaims): Promise<WopiUserAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { name: true, isActive: true, role: true },
  })
  if (!user || !user.isActive) return null

  const hasAccess =
    user.role === "admin" ||
    (await prisma.projectMember.findFirst({
      where: { projectId: claims.projectId, userId: claims.userId },
      select: { id: true },
    })) !== null
  if (!hasAccess) return null

  return { userId: claims.userId, name: user.name, canWrite: claims.canWrite }
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/** Token + DB check in one step; used by every WOPI endpoint. */
export async function authorizeWopi(
  request: Request,
  fileId: string
): Promise<{ claims: WopiTokenClaims; access: WopiUserAccess } | { error: NextResponse }> {
  const auth = authenticateWopiRequest(request, fileId)
  if ("error" in auth) return auth
  const access = await loadWopiUserAccess(auth.claims)
  if (!access) return { error: forbidden() }
  return { claims: auth.claims, access }
}

export type BodyReadResult = { ok: true; body: Buffer } | { ok: false; reason: "too_large" }

/**
 * Read a request body, aborting as soon as it exceeds `maxBytes` so an
 * oversized PutFile never gets fully buffered in memory.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<BodyReadResult> {
  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" }
  if (!request.body) return { ok: true, body: Buffer.alloc(0) }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, reason: "too_large" }
    }
    chunks.push(value)
  }
  return { ok: true, body: Buffer.concat(chunks, total) }
}

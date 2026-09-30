import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { accessVia, can, isProjectLive, loadProjectActor, type ProjectActor } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { searchParamsObject } from "@/services/_shared/cursor"
import type { ApiErrorCode } from "@/services/_shared/error-codes"
import { isServiceError, NotFoundError } from "@/services/_shared/errors"
import { authenticateApiRequest, type ApiPrincipal } from "@/services/api-tokens/api-token-auth"

/**
 * Route wrapper of the read-only REST API (/api/v1). See docs/api-v1.md.
 *
 * - Authentication: `Authorization: Bearer kfl_...` only (session cookies are
 *   never consulted, so CSRF does not apply). 401 / 403 / 429 from
 *   authenticateApiRequest.
 * - Project routes additionally resolve the token user's project actor with
 *   the same policy as the UI (lib/authz): no path into the project, a
 *   missing or trashed project → 404 (existence not revealed). Every v1
 *   endpoint needs only `project.view`.
 * - Success: `{ data, nextCursor? }` + X-RateLimit-* headers, never cached.
 * - Errors: `{ error, code }` with the HTTP status.
 */

const log = logger.child({ module: "api-v1" })

export interface V1Context<P> {
  request: Request
  /** Query string as a plain object (empty values dropped). */
  query: Record<string, string>
  principal: ApiPrincipal
  params: P
}

export interface V1ProjectContext<P> extends V1Context<P> {
  projectId: string
  actor: ProjectActor
}

type RouteSegment<P> = { params: Promise<P> }
type V1Handler<P> = (request: Request, segment: RouteSegment<P>) => Promise<NextResponse>

export function v1ErrorResponse(status: number, error: string, code: ApiErrorCode, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

function zodMessage(error: ZodError): string {
  const first = error.issues[0]
  if (!first) return "Invalid request"
  const at = first.path.length > 0 ? `${first.path.join(".")}: ` : ""
  return `Invalid request: ${at}${first.message}`
}

/** Any thrown error → `{ error, code }` (details only for expected errors). */
export function v1ErrorFrom(error: unknown, headers: Record<string, string>): NextResponse {
  if (isServiceError(error)) return v1ErrorResponse(error.status, error.message, error.code, headers)
  if (error instanceof ZodError) return v1ErrorResponse(400, zodMessage(error), "VALIDATION", headers)
  log.error("v1 request failed", { error: error instanceof Error ? error.message : String(error) })
  return v1ErrorResponse(500, "Internal error", "INTERNAL", headers)
}

export function v1Route<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: V1Context<P>) => Promise<object>
): V1Handler<P> {
  return async (request, segment) => {
    let auth: Awaited<ReturnType<typeof authenticateApiRequest>>
    try {
      auth = await authenticateApiRequest(request)
    } catch (error) {
      // DB unreachable during the token lookup: fail closed.
      return v1ErrorFrom(error, {})
    }
    if (!auth.ok) return v1ErrorResponse(auth.status, auth.error, auth.code, auth.headers)

    const headers = {
      "X-RateLimit-Limit": String(auth.rate.limit),
      "X-RateLimit-Remaining": String(auth.rate.remaining),
    }
    try {
      const params = await segment.params
      const body = await handler({ request, query: searchParamsObject(request.url), principal: auth.principal, params })
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store", ...headers } })
    } catch (error) {
      return v1ErrorFrom(error, headers)
    }
  }
}

/** The token user's actor for the project, or 404 (no access / missing / trashed). */
export async function resolveV1ProjectActor(principal: ApiPrincipal, projectId: string): Promise<ProjectActor> {
  const [live, actor] = await Promise.all([
    isProjectLive(projectId),
    loadProjectActor(principal.userId, principal.role, projectId),
  ])
  if (!live || !accessVia(actor) || !can(actor, "project.view")) throw new NotFoundError()
  return actor
}

export function v1ProjectRoute<P extends { projectId: string }>(
  handler: (ctx: V1ProjectContext<P>) => Promise<object>
): V1Handler<P> {
  return v1Route<P>(async (ctx) => {
    const { projectId } = ctx.params
    const actor = await resolveV1ProjectActor(ctx.principal, projectId)
    return handler({ ...ctx, projectId, actor })
  })
}

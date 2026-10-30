import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { scopeForAction } from "@/lib/api-tokens/scopes"
import { accessVia, can, isProjectLive, loadProjectActor, type ProjectAction, type ProjectActor } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { searchParamsObject } from "@/services/_shared/cursor"
import type { ApiErrorCode } from "@/services/_shared/error-codes"
import { ForbiddenError, isServiceError, NotFoundError } from "@/services/_shared/errors"
import { authenticateApiRequest, type ApiPrincipal } from "@/services/api-tokens/api-token-auth"

/**
 * Route wrapper of the REST API (/api/v1). See docs/api-v1.md.
 *
 * - Authentication: `Authorization: Bearer kfl_...` only (session cookies are
 *   never consulted, so CSRF does not apply). 401 / 403 / 429 from
 *   authenticateApiRequest.
 * - Project routes additionally resolve the token user's project actor with
 *   the same policy as the UI (lib/authz): no path into the project, a
 *   missing or trashed project → 404 (existence not revealed). Every v1
 *   endpoint needs `project.view`; a write additionally calls
 *   `assertV1Action` (token scope **and** the owner's project role).
 * - A token limited to some projects (`projectIds`) sees the others as 404.
 *   Every token path into a project MUST go through resolveV1ProjectActor
 *   (also when the project is derived from a PBI / task / comment id): it is
 *   the only place that enforces the restriction.
 * - Success: `{ data, nextCursor? }` + X-RateLimit-* headers, never cached.
 * - Errors: `{ error, code }` with the HTTP status; `INSUFFICIENT_SCOPE` adds `requiredScope`.
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

/** A handler result with a status other than 200 (e.g. 201 Created) and extra headers. */
export class V1Reply {
  constructor(
    readonly body: object,
    readonly status: number,
    readonly headers: Record<string, string> = {}
  ) {}
}

type RouteSegment<P> = { params: Promise<P> }
export type V1Handler<P> = (request: Request, segment: RouteSegment<P>) => Promise<NextResponse>

export function v1ErrorResponse(
  status: number,
  error: string,
  code: ApiErrorCode,
  headers?: Record<string, string>,
  extra: object = {}
): NextResponse {
  return NextResponse.json({ ...extra, error, code }, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

function zodMessage(error: ZodError): string {
  const first = error.issues[0]
  if (!first) return "Invalid request"
  const at = first.path.length > 0 ? `${first.path.join(".")}: ` : ""
  return `Invalid request: ${at}${first.message}`
}

/**
 * Codes whose `extra` reaches token clients. Service errors carry UI-oriented
 * extras (ids, counts, state); only allowlisted ones are part of the v1 contract.
 */
const V1_EXTRA_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["INSUFFICIENT_SCOPE"])

/** The v1 error body (`{ error, code, ...allowlisted extra }`) and its HTTP status. */
export interface V1ErrorBody {
  status: number
  body: { error: string; code: ApiErrorCode } & Record<string, unknown>
}

/**
 * Any thrown error → status + `{ error, code }` (details only for expected
 * errors). Unexpected errors are logged here, once, and answer a bare
 * `INTERNAL` (no message, no stack). Shared by the REST routes and the MCP tools.
 */
export function v1ErrorBody(error: unknown, logContext: Record<string, unknown> = {}): V1ErrorBody {
  if (isServiceError(error)) {
    const extra = V1_EXTRA_CODES.has(error.code) ? error.extra : {}
    return { status: error.status, body: { ...extra, error: error.message, code: error.code } }
  }
  if (error instanceof ZodError) return { status: 400, body: { error: zodMessage(error), code: "VALIDATION" } }
  log.error("v1 request failed", { ...logContext, ...describeUnexpected(error) })
  return { status: 500, body: { error: "Internal error", code: "INTERNAL" } }
}

/**
 * Pure: log fields of an unexpected error. Prisma errors are logged by class
 * name and error code only: their messages can quote the query and its values.
 */
export function describeUnexpected(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error: String(error) }
  if (error.name.startsWith("PrismaClient")) {
    const code = (error as { code?: unknown }).code
    return { errorName: error.name, ...(typeof code === "string" ? { errorCode: code } : {}) }
  }
  return { errorName: error.name, error: error.message }
}

/** Any thrown error → `{ error, code }` response (see v1ErrorBody). */
export function v1ErrorFrom(error: unknown, headers: Record<string, string>): NextResponse {
  const { status, body } = v1ErrorBody(error)
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

export function v1Route<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: V1Context<P>) => Promise<object | V1Reply>
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
      const result = await handler({ request, query: searchParamsObject(request.url), principal: auth.principal, params })
      if (result instanceof V1Reply) {
        return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store", ...headers, ...result.headers } })
      }
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store", ...headers } })
    } catch (error) {
      return v1ErrorFrom(error, headers)
    }
  }
}

/** The token user's actor for the project, or 404 (no access / missing / trashed / outside the token's projects). */
export async function resolveV1ProjectActor(principal: ApiPrincipal, projectId: string): Promise<ProjectActor> {
  if (principal.projectIds && !principal.projectIds.includes(projectId)) throw new NotFoundError()
  const [live, actor] = await Promise.all([
    isProjectLive(projectId),
    loadProjectActor(principal.userId, principal.role, projectId),
  ])
  if (!live || !accessVia(actor) || !can(actor, "project.view")) throw new NotFoundError()
  return actor
}

export function v1ProjectRoute<P extends { projectId: string }>(
  handler: (ctx: V1ProjectContext<P>) => Promise<object | V1Reply>
): V1Handler<P> {
  return v1Route<P>(async (ctx) => {
    const { projectId } = ctx.params
    const actor = await resolveV1ProjectActor(ctx.principal, projectId)
    return handler({ ...ctx, projectId, actor })
  })
}

/**
 * A write through a token needs both: the token's scope for the action
 * (403 INSUFFICIENT_SCOPE, naming the missing scope) and the owner's project
 * role allowing it (403 FORBIDDEN) — the same matrix as the UI.
 */
export function assertV1Action(principal: ApiPrincipal, actor: ProjectActor, action: ProjectAction): void {
  const scope = scopeForAction(action)
  if (!scope || !principal.scopes.includes(scope)) {
    throw new ForbiddenError("Insufficient scope", { requiredScope: scope }, "INSUFFICIENT_SCOPE")
  }
  if (!can(actor, action)) throw new ForbiddenError("Forbidden", {}, "FORBIDDEN")
}

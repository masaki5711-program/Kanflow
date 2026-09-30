import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { logger } from "@/lib/logger"
import { codeForStatus, type ApiErrorCode } from "./error-codes"
import { isForeignKeyViolation, isRecordNotFound, isServiceError } from "./errors"

const log = logger.child({ module: "api" })

export interface ErrorMappingOptions {
  /** Message of the 500 body (the route's historical wording). */
  fallback: string
  /** Short context for the error log line, e.g. "Backlog CREATE". */
  context?: string
}

/**
 * The one error → HTTP mapper for route handlers.
 *
 * Every body carries `error` (legacy message, kept for backward compat) and a
 * stable `code` the client localizes:
 * - ServiceError           → its status, `{ error: message, code, ...extra }`
 * - ZodError               → 400, `{ error: issues, code: "VALIDATION" }` (issues contract unchanged)
 * - malformed JSON body    → 400, `{ error: "Invalid JSON", code: "INVALID_JSON" }`
 * - Prisma P2025 (missing) → 404, `{ error: "Not found", code: "NOT_FOUND" }`
 * - Prisma P2003 (bad FK)  → 400, `{ error: "Invalid reference", code: "INVALID_REFERENCE" }`
 * - anything else          → 500, `{ error: fallback, code: "INTERNAL" }` + error log
 */
export function toHttpResponse(error: unknown, opts: ErrorMappingOptions): NextResponse {
  if (isServiceError(error)) {
    return NextResponse.json({ error: error.message, code: error.code, ...error.extra }, { status: error.status })
  }
  if (error instanceof ZodError) return errorResponse(400, error.issues, "VALIDATION")
  if (error instanceof SyntaxError) return errorResponse(400, "Invalid JSON", "INVALID_JSON")
  if (isRecordNotFound(error)) return errorResponse(404, "Not found", "NOT_FOUND")
  if (isForeignKeyViolation(error)) return errorResponse(400, "Invalid reference", "INVALID_REFERENCE")
  log.error(`${opts.context ?? "request"} failed`, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return errorResponse(500, opts.fallback, "INTERNAL")
}

/**
 * Route-level error body `{ error, code, ...extra }` (`code` defaults to the
 * generic code of the status). Use for errors a route answers directly.
 */
export function errorResponse(
  status: number,
  error: unknown,
  code: ApiErrorCode = codeForStatus(status),
  init: { extra?: Readonly<Record<string, unknown>>; headers?: HeadersInit } = {}
): NextResponse {
  return NextResponse.json({ error, code, ...init.extra }, { status, headers: init.headers })
}

/** `NextResponse.json(body, { status })` shorthand for the success path. */
export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status })
}

/** Standard `{ success: true }` body used by most DELETE handlers. */
export function successResponse(): NextResponse {
  return NextResponse.json({ success: true })
}

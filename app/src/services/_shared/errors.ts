/**
 * Typed service errors. Services throw these for expected business outcomes;
 * `toHttpResponse` (./http.ts) maps them to the JSON error envelope the
 * frontend understands: `{ error: <legacy message>, code, ...extra }`.
 * `code` is stable and localized by the client (see ./error-codes.ts); when a
 * thrower gives none, the generic code of the HTTP status is used.
 */
import { codeForStatus, type ApiErrorCode } from "./error-codes"

export type ServiceErrorExtra = Readonly<Record<string, unknown>>

export abstract class ServiceError extends Error {
  abstract readonly status: number
  /** Extra top-level fields merged into the error body (e.g. `blocker`). */
  readonly extra: ServiceErrorExtra
  private readonly explicitCode: ApiErrorCode | undefined

  constructor(message: string, extra: ServiceErrorExtra = {}, code?: ApiErrorCode) {
    super(message)
    this.name = new.target.name
    this.extra = extra
    this.explicitCode = code
  }

  /** Machine-readable code sent to the client (generic per status unless given). */
  get code(): ApiErrorCode {
    return this.explicitCode ?? codeForStatus(this.status)
  }
}

/** 404 — the entity does not exist (or not inside the given project / owner). */
export class NotFoundError extends ServiceError {
  readonly status = 404
  constructor(message = "Not found", extra?: ServiceErrorExtra, code?: ApiErrorCode) {
    super(message, extra, code)
  }
}

/** 409 — uniqueness or state conflict (duplicate name, sprint already running, ...). */
export class ConflictError extends ServiceError {
  readonly status = 409
}

/** 400 — input that passed the schema but breaks a business rule (bad date, cycle, ...). */
export class ValidationError extends ServiceError {
  readonly status = 400
}

/** 403 — a data-dependent refusal the route-level policy cannot express. */
export class ForbiddenError extends ServiceError {
  readonly status = 403
}

/** Service-level status for errors that carry their own HTTP status (e.g. upload 413 / 415). */
export class StatusError extends ServiceError {
  readonly status: number
  constructor(status: number, message: string, extra?: ServiceErrorExtra, code?: ApiErrorCode) {
    super(message, extra, code)
    this.status = status
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError
}

/** Prisma known-request error code (duck-typed so tests need no Prisma runtime). */
export function prismaErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code
    return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null
  }
  return null
}

/** Record to update / delete does not exist. */
export function isRecordNotFound(err: unknown): boolean {
  return prismaErrorCode(err) === "P2025"
}

/** Unique constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return prismaErrorCode(err) === "P2002"
}

/** Foreign key constraint violation (a referenced row does not exist). */
export function isForeignKeyViolation(err: unknown): boolean {
  return prismaErrorCode(err) === "P2003"
}

/**
 * Re-throw Prisma "not found" / "unique" errors as service errors with the
 * given messages. Anything else is re-thrown unchanged.
 */
export function rethrowPrisma(
  err: unknown,
  messages: { notFound?: string; conflict?: string; notFoundCode?: ApiErrorCode; conflictCode?: ApiErrorCode }
): never {
  if (messages.notFound !== undefined && isRecordNotFound(err)) {
    throw new NotFoundError(messages.notFound, {}, messages.notFoundCode)
  }
  if (messages.conflict !== undefined && isUniqueViolation(err)) {
    throw new ConflictError(messages.conflict, {}, messages.conflictCode)
  }
  throw err
}

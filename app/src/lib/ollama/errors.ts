/**
 * Typed errors for Ollama calls. Every failure surfaced by the Ollama client
 * is one of these, so routes can map them to consistent HTTP responses.
 *
 * `name` intentionally mirrors the DOM abort names for timeout / abort
 * ("TimeoutError" / "AbortError"): existing callers (e.g. the translation
 * worker) classify failures by `err.name` and keep working unchanged. Use
 * `instanceof` or `code` to tell Ollama errors apart.
 */

export type OllamaErrorCode =
  | "ollama_timeout"
  | "ollama_unavailable"
  | "ollama_aborted"
  | "ollama_http_error"

const MAX_DETAIL = 500

export abstract class OllamaError extends Error {
  abstract readonly code: OllamaErrorCode
  /** HTTP status a route should answer with for this failure. */
  abstract readonly httpStatus: number
}

export class OllamaTimeoutError extends OllamaError {
  readonly code = "ollama_timeout" as const
  readonly httpStatus = 408
  constructor(readonly timeoutMs?: number, options?: { cause?: unknown }) {
    super(
      timeoutMs
        ? `The AI did not finish within ${Math.round(timeoutMs / 1000)}s. Please try again, or shorten the request.`
        : "The AI request timed out. Please try again, or shorten the request.",
      options
    )
    this.name = "TimeoutError"
  }
}

export class OllamaUnavailableError extends OllamaError {
  readonly code = "ollama_unavailable" as const
  readonly httpStatus = 503
  constructor(options?: { cause?: unknown }) {
    super("The AI server is not reachable right now. Please try again later.", options)
    this.name = "OllamaUnavailableError"
  }
}

export class OllamaAbortedError extends OllamaError {
  readonly code = "ollama_aborted" as const
  readonly httpStatus = 499
  constructor(options?: { cause?: unknown }) {
    super("The AI request was cancelled.", options)
    this.name = "AbortError"
  }
}

export class OllamaHttpError extends OllamaError {
  readonly code = "ollama_http_error" as const
  readonly httpStatus = 502
  /** Response body from Ollama (truncated), for logs only. */
  readonly detail: string
  constructor(readonly status: number, detail = "") {
    super(`The AI server returned an error (HTTP ${status}). Please try again later.`)
    this.name = "OllamaHttpError"
    this.detail = detail.slice(0, MAX_DETAIL)
  }
}

function errorName(value: unknown): string | undefined {
  if (value && typeof value === "object" && "name" in value) {
    const n = (value as { name: unknown }).name
    return typeof n === "string" ? n : undefined
  }
  return undefined
}

/** Map an AbortSignal reason to a typed error. */
export function abortReasonToError(reason: unknown): OllamaError {
  if (reason instanceof OllamaError) return reason
  if (errorName(reason) === "TimeoutError") return new OllamaTimeoutError(undefined, { cause: reason })
  return new OllamaAbortedError({ cause: reason })
}

/**
 * Normalize any failure of an Ollama call. When `signal` is aborted its reason
 * wins (a fetch aborted by a timeout surfaces as a generic AbortError).
 * `fallback` decides what an unrecognized error becomes.
 */
export function toOllamaError(
  err: unknown,
  signal?: AbortSignal,
  fallback: (err: unknown) => OllamaError = (e) => new OllamaUnavailableError({ cause: e })
): OllamaError {
  if (err instanceof OllamaError) return err
  if (signal?.aborted) return abortReasonToError(signal.reason)
  const name = errorName(err)
  if (name === "TimeoutError" || name === "AbortError") return abortReasonToError(err)
  return fallback(err)
}

/** User-facing message for any error thrown around an Ollama call. */
export function ollamaErrorMessage(err: unknown): string {
  if (err instanceof OllamaError) return err.message
  return err instanceof Error ? err.message : "AI request failed"
}

/**
 * Consistent JSON error response for routes:
 * 499 aborted / 408 timeout / 503 unavailable / 502 upstream HTTP error / 500 other.
 */
export function ollamaErrorResponse(err: unknown, extra: Record<string, unknown> = {}): Response {
  if (err instanceof OllamaError) {
    return Response.json({ ...extra, error: err.code, message: err.message }, { status: err.httpStatus })
  }
  return Response.json({ ...extra, error: "ai_error", message: "AI request failed" }, { status: 500 })
}

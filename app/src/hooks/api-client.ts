import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { apiErrorMessageKey } from "@/lib/i18n/api-errors"
import { emitActivity } from "./activity"

/** Error thrown by `apiFetch` for non-2xx responses and network failures. */
export class ApiError extends Error {
  readonly status: number
  /** Parsed response body (JSON or text), when available. */
  readonly body: unknown
  /** Machine-readable code if the server sent one (`{ code }`). */
  readonly code?: string
  /**
   * The server's own (legacy, Japanese-only) message. `message` is this text
   * localized to the UI language when `code` is known (see `localizeApiError`).
   */
  readonly serverMessage: string

  constructor(message: string, status: number, body?: unknown, code?: string, serverMessage: string = message) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
    this.code = code
    this.serverMessage = serverMessage
  }

  /** True for connection failures (no HTTP response at all). */
  get isNetworkError(): boolean {
    return this.status === 0
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/** Duck-typed `code` of any error-like value (ApiError or a plain `{ code }`). */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined
  const code = (err as { code?: unknown }).code
  return typeof code === "string" ? code : undefined
}

/**
 * User-facing message for an API error in the language of `t`: the localized
 * text for a known `code`, otherwise the server message (for an ApiError, its
 * raw `serverMessage`), otherwise `String(err)`.
 *
 *   toast.error(localizeApiError(err, t))
 */
export function localizeApiError(err: unknown, t: Translations): string {
  const key = apiErrorMessageKey(errorCode(err))
  if (key) return t[key]
  if (err instanceof ApiError) return err.serverMessage
  if (err instanceof Error) return err.message
  return String(err)
}

const LANGUAGES: readonly Language[] = ["ja", "en", "id"]
let apiErrorLanguage: Language | null = null

/**
 * Language used to localize `ApiError.message` (so every existing
 * `toastOnError` / `${t.xxxFailed}: ${e.message}` shows the user's language).
 * Call when the UI language changes (e.g. a project-level override); `null`
 * reverts to `<html lang>`.
 */
export function setApiErrorLanguage(lang: Language | null): void {
  apiErrorLanguage = lang
}

function currentLanguage(): Language | null {
  if (apiErrorLanguage) return apiErrorLanguage
  if (typeof document === "undefined") return null
  const lang = document.documentElement.lang as Language
  return LANGUAGES.includes(lang) ? lang : null
}

/** Build the ApiError thrown by apiFetch; `message` localized when possible. */
function buildApiError(serverMessage: string, status: number, body: unknown, code: string | undefined): ApiError {
  const lang = currentLanguage()
  const key = apiErrorMessageKey(code)
  const message = lang && key ? getTranslations(lang)[key] : serverMessage
  return new ApiError(message, status, body, code, serverMessage)
}

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  )
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

/**
 * Extract a human-readable message from an error response body. Understands
 * the shapes used by our API routes and common libraries:
 *   { error: "msg" } | { message: "msg" } | { error: { message } } |
 *   { errors: [{ message }] } | "plain text"
 * Falls back to `HTTP <status> <statusText>`.
 */
export function parseErrorMessage(body: unknown, status: number, statusText = ""): string {
  const direct = nonEmptyString(body)
  // Ignore HTML error pages (e.g. proxy 502) — they are not user-friendly.
  if (direct && !direct.startsWith("<")) return direct.slice(0, 500)

  if (typeof body === "object" && body !== null) {
    const rec = body as Record<string, unknown>
    const fromError = nonEmptyString(rec.error)
    if (fromError) return fromError
    const fromMessage = nonEmptyString(rec.message)
    if (fromMessage) return fromMessage
    if (typeof rec.error === "object" && rec.error !== null) {
      const nested = nonEmptyString((rec.error as Record<string, unknown>).message)
      if (nested) return nested
    }
    if (Array.isArray(rec.errors) && rec.errors.length > 0) {
      const first = rec.errors[0]
      const msg = nonEmptyString(first) ?? (typeof first === "object" && first !== null
        ? nonEmptyString((first as Record<string, unknown>).message)
        : null)
      if (msg) return msg
    }
  }
  return `HTTP ${status}${statusText ? ` ${statusText}` : ""}`
}

function parseErrorCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined
  const code = (body as Record<string, unknown>).code
  return typeof code === "string" ? code : undefined
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined
  const text = await res.text()
  if (text === "") return undefined
  const type = res.headers.get("content-type") ?? ""
  if (type.includes("json")) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return text
}

export interface ApiFetchInit extends Omit<RequestInit, "body"> {
  /** Serialised as JSON with the proper Content-Type. Mutually exclusive with `body`. */
  json?: unknown
  body?: RequestInit["body"]
  /**
   * Validate / narrow the successful response (e.g. `schema.parse` from zod).
   * A throw here is surfaced as an ApiError with status 200.
   */
  parse?: (raw: unknown) => unknown
}

/**
 * `fetch` wrapper for our JSON API.
 *  - resolves with the parsed body (JSON, text, or undefined for empty/204);
 *  - rejects with `ApiError` carrying the server's message for non-2xx
 *    responses and with status 0 for network failures;
 *  - re-throws AbortError untouched (check with `isAbortError`);
 *  - emits the activity event used by the idle-logout watcher.
 *
 *   const pbi = await apiFetch<Pbi>(`/api/projects/${id}/backlog`, { method: "POST", json: input })
 */
export async function apiFetch<T = unknown>(url: string, init: ApiFetchInit = {}): Promise<T> {
  const { json, parse, headers, body, ...rest } = init
  const finalHeaders = new Headers(headers)
  if (json !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json")
  }
  if (!finalHeaders.has("Accept")) finalHeaders.set("Accept", "application/json")

  emitActivity()

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : body,
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw buildApiError(err instanceof Error ? err.message : "Network error", 0, undefined, "NETWORK_ERROR")
  }

  const data = await readBody(res)
  if (!res.ok) {
    throw buildApiError(parseErrorMessage(data, res.status, res.statusText), res.status, data, parseErrorCode(data))
  }
  if (!parse) return data as T
  try {
    return parse(data) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid response"
    throw new ApiError(message, res.status, data, "INVALID_RESPONSE")
  }
}

import { INTERNAL_TOKEN_HEADER } from "./internal-auth"

/**
 * One probe of a web process's GET /api/internal/ai-busy.
 * Never throws: every failure (network, timeout, non-2xx, bad JSON) is
 * reported as `{ ok: false }` so the caller can fail safe.
 */

export const AI_BUSY_PATH = "/api/internal/ai-busy"

export interface AiBusyPayload {
  /** User-facing AI calls currently running in that process. */
  busyHigh: number
  /** ms since that process's last user-facing call ended (null = never). */
  idleForMs: number | null
}

export type PeerProbe = ({ ok: true } & AiBusyPayload) | { ok: false; error: string }

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export function parseAiBusy(body: unknown): AiBusyPayload | null {
  if (typeof body !== "object" || body === null) return null
  const b = body as Record<string, unknown>
  const busy = b.busyHigh
  if (typeof busy !== "number" || !Number.isFinite(busy) || busy < 0) return null
  const idle = b.idleForMs
  const idleForMs = typeof idle === "number" && Number.isFinite(idle) && idle >= 0 ? idle : null
  return { busyHigh: Math.floor(busy), idleForMs }
}

export async function probePeer(
  baseUrl: string,
  token: string | null,
  opts: { timeoutMs: number; fetchImpl?: FetchLike }
): Promise<PeerProbe> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const headers: Record<string, string> = { accept: "application/json" }
  if (token) headers[INTERNAL_TOKEN_HEADER] = token
  try {
    const res = await fetchImpl(`${baseUrl}${AI_BUSY_PATH}`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const parsed = parseAiBusy(await res.json())
    if (!parsed) return { ok: false, error: "invalid payload" }
    return { ok: true, ...parsed }
  } catch (err) {
    const name = err instanceof Error ? err.name : ""
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, error: `timeout after ${opts.timeoutMs}ms` }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Cross-process AI gate configuration (pure; read from an env object).
 *
 * AI_GATE_PEERS           comma-separated base URLs of web processes whose
 *                         user-facing AI activity the worker must yield to.
 *                         Default `http://127.0.0.1:${PORT ?? 3000}`.
 *                         Set to `none` to disable peer polling.
 * INTERNAL_API_TOKEN      shared secret sent as `x-internal-token`.
 * AI_GATE_POLL_MS         peer poll interval (default 1000).
 * AI_GATE_TIMEOUT_MS      per-probe HTTP timeout (default 800).
 * AI_GATE_MAX_BACKOFF_MS  max re-probe delay of an unreachable peer (30000).
 * AI_GATE_QUIET_MS        a peer idle for less than this still counts as busy (3000).
 * AI_GATE_DEGRADED_INTERVAL_MS  while a peer is unreachable the worker admits at
 *                         most one row per this interval (default 30000).
 */

export interface AiGateConfig {
  peers: string[]
  token: string | null
  pollMs: number
  timeoutMs: number
  maxBackoffMs: number
  quietMs: number
  degradedIntervalMs: number
}

export function envPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** Parse AI_GATE_PEERS into normalized, de-duplicated http(s) base URLs. Invalid entries are dropped. */
export function parsePeers(raw: string | undefined, fallbackPort = "3000"): string[] {
  const v = raw?.trim()
  if (v !== undefined && v.toLowerCase() === "none") return []
  const source = v ? v : `http://127.0.0.1:${fallbackPort}`
  const out: string[] = []
  for (const part of source.split(",")) {
    const s = part.trim()
    if (!s) continue
    try {
      const u = new URL(s)
      if (u.protocol !== "http:" && u.protocol !== "https:") continue
      const base = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`
      if (!out.includes(base)) out.push(base)
    } catch {
      // not a URL — ignore
    }
  }
  return out
}

export function loadAiGateConfig(env: NodeJS.ProcessEnv): AiGateConfig {
  const token = env.INTERNAL_API_TOKEN?.trim()
  return {
    peers: parsePeers(env.AI_GATE_PEERS, env.PORT?.trim() || "3000"),
    token: token ? token : null,
    pollMs: envPositiveInt(env.AI_GATE_POLL_MS, 1_000),
    timeoutMs: envPositiveInt(env.AI_GATE_TIMEOUT_MS, 800),
    maxBackoffMs: envPositiveInt(env.AI_GATE_MAX_BACKOFF_MS, 30_000),
    quietMs: envPositiveInt(env.AI_GATE_QUIET_MS, 3_000),
    degradedIntervalMs: envPositiveInt(env.AI_GATE_DEGRADED_INTERVAL_MS, 30_000),
  }
}

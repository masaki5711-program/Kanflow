/**
 * Target deny list: databases the migrator must never write to (the live
 * production PostgreSQL once it serves traffic, other agents' / teams'
 * databases, ...). Configured locally and never committed:
 *   KANFLOW_MIGRATOR_DENY_TARGETS="host:port/db, host:port/*"   and/or
 *   --deny-file <file>   one entry per line, "#" comments
 * An entry is host[:port][/db]; port and db may be "*" (omitted = "*").
 * localhost / 127.0.0.1 / ::1 are treated as the same host. No DNS lookups:
 * list every name the server is reachable under.
 * At least one entry is required - an empty list means the guard was not set up.
 */
import type { Endpoint } from "./args"
import { describeEndpoint } from "./args"
import { MigratorError } from "./errors"

export interface DenyEntry {
  host: string
  port: number | "*"
  database: string
  raw: string
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0:0:0:0:0:0:0:1"])

export function normalizeHost(host: string): string {
  const h = host.trim().toLowerCase()
  return LOOPBACK.has(h) ? "loopback" : h.replace(/^\[(.*)\]$/, "$1")
}

function parseEntry(raw: string): DenyEntry {
  const m = /^(\[[^\]]+\]|[^:/\s]+)(?::([^/\s]+))?(?:\/(\S+))?$/.exec(raw)
  if (!m) throw new MigratorError("DENY_LIST_INVALID", `cannot parse deny-list entry "${raw}"`)
  const [, host, port, db] = m
  if (port !== undefined && port !== "*" && !/^\d{1,5}$/.test(port)) {
    throw new MigratorError("DENY_LIST_INVALID", `bad port in deny-list entry "${raw}"`)
  }
  return {
    host: host === "*" ? "*" : normalizeHost(host),
    port: port === undefined || port === "*" ? "*" : Number(port),
    database: db ?? "*",
    raw,
  }
}

export function parseDenyEntries(text: string): DenyEntry[] {
  return text
    .split(/[\r\n,]+/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l !== "")
    .map(parseEntry)
}

export function loadDenyList(env: Record<string, string | undefined>, fileText: string | null): DenyEntry[] {
  const entries = [...parseDenyEntries(env.KANFLOW_MIGRATOR_DENY_TARGETS ?? ""), ...parseDenyEntries(fileText ?? "")]
  if (entries.length === 0) {
    throw new MigratorError(
      "DENY_LIST_MISSING",
      "no deny-list entry: list the production / in-use PostgreSQL databases in KANFLOW_MIGRATOR_DENY_TARGETS or --deny-file",
    )
  }
  return entries
}

function matches(e: DenyEntry, t: Endpoint): boolean {
  return (
    (e.host === "*" || e.host === normalizeHost(t.host)) &&
    (e.port === "*" || e.port === t.port) &&
    (e.database === "*" || e.database === t.database)
  )
}

export function assertTargetAllowed(target: Endpoint, source: Endpoint, deny: readonly DenyEntry[]): void {
  const hit = deny.find((e) => matches(e, target))
  if (hit) throw new MigratorError("TARGET_DENIED", `target ${describeEndpoint(target)} matches deny-list entry "${hit.raw}"`)
  if (normalizeHost(target.host) === normalizeHost(source.host) && target.port === source.port) {
    throw new MigratorError("TARGET_DENIED", `target ${describeEndpoint(target)} is the source server`)
  }
}

/**
 * --expect-target host:port/db: the operator states the target a second time,
 * independently of --target; any difference (typo, pasted wrong URL) refuses.
 */
export function assertExpectedTarget(target: Endpoint, expect: string): void {
  const m = /^(\[[^\]]+\]|[^:/\s]+):(\d{1,5})\/(\S+)$/.exec(expect.trim())
  const ok =
    m !== null && normalizeHost(m[1]) === normalizeHost(target.host) && Number(m[2]) === target.port && m[3] === target.database
  if (!ok) {
    throw new MigratorError("EXPECT_TARGET_MISMATCH", `--expect-target does not equal the --target endpoint ${describeEndpoint(target)} (format host:port/db)`)
  }
}

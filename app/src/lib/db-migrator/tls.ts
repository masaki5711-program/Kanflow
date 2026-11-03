/**
 * TLS for the two connections. A non-loopback endpoint MUST use TLS with
 * certificate verification against an explicit CA file (--source-ca /
 * --target-ca); there is no "encrypt but do not verify" mode. Loopback
 * connections (the migrator runs on the database host) may go without TLS,
 * or use it when a CA is given.
 */
import { normalizeHost } from "./deny-list"
import { MigratorError } from "./errors"

export interface VerifyingTls {
  rejectUnauthorized: true
  ca: string
}

function tlsFor(host: string, caPem: string | null, side: string): VerifyingTls | undefined {
  if (caPem !== null) return { rejectUnauthorized: true, ca: caPem }
  if (normalizeHost(host) === "loopback") return undefined
  throw new MigratorError("TLS_REQUIRED", `${side} ${host} is not a loopback host: pass --${side}-ca <ca.pem> (TLS with certificate verification is required)`)
}

export function pgSsl(host: string, caPem: string | null): VerifyingTls | undefined {
  return tlsFor(host, caPem, "target")
}

export function mysqlSsl(host: string, caPem: string | null): VerifyingTls | undefined {
  return tlsFor(host, caPem, "source")
}

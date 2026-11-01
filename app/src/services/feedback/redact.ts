import { allowedHosts as gitAllowedHosts } from "@/lib/git/repo-url"
import { redactSecrets, REDACTED } from "@/services/git/repo-redact"

/**
 * Server-side redaction of failure reports (W11, the second layer: the client redacts first, the
 * server never trusts it). Pure.
 *
 * What is masked (in this order):
 *  1. secrets: private keys, well-known token formats, URL passwords, `password=…` assignments
 *     (the rules of the Git index, services/git/repo-redact), Kanflow API tokens (`kfl_…`),
 *     `Authorization` / `Cookie` header values and bare `Bearer …` tokens → `[REDACTED]`
 *  2. e-mail addresses → `<email>`
 *  3. MAC and IP addresses → `<mac>` / `<ip>`
 *  4. home directories (`/home/<user>`, `/Users/<user>`, `C:\Users\<user>`) → `~`
 *  5. internal host names (any host name or URL host that is not in the allow-list) → `<host>`
 *
 * `findResidualSecret` is a stricter, independent check run on the REDACTED text: something that
 * still looks like a credential means the report is refused (422 FEEDBACK_REDACTION_FAILED) rather
 * than stored. Redaction never "fixes up" what it cannot recognise.
 */

export type RedactionKind = "secret" | "email" | "ip" | "mac" | "homePath" | "host"

export interface RedactionResult {
  text: string
  /** How many values of each kind were masked (logged, never the values). */
  counts: Record<RedactionKind, number>
  total: number
}

/** Hosts that stay readable: public package / source hosts and local addresses. Extended by FEEDBACK_ALLOWED_HOSTS. */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  "github.com",
  "crates.io",
  "docs.rs",
  "npmjs.org",
  "npmjs.com",
  "pypi.org",
  "rust-lang.org",
  "nodejs.org",
  "localhost",
]

/**
 * The defaults, the Git hosts Kanflow is configured for (GIT_ALLOWED_HOSTS: links to merge requests stay readable)
 * and FEEDBACK_ALLOWED_HOSTS: comma-separated host names (a leading "*." or "." allows subdomains too).
 */
export function allowedHostsFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const extra = (env.FEEDBACK_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...DEFAULT_ALLOWED_HOSTS, ...gitAllowedHosts(env as NodeJS.ProcessEnv), ...extra]
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase()
  return allowed.some((entry) => {
    const bare = entry.replace(/^\*?\./, "")
    if (h === bare) return true
    return (entry.startsWith("*.") || entry.startsWith(".")) && h.endsWith(`.${bare}`)
  })
}

const KANFLOW_TOKEN = /\bkfl_[A-Za-z0-9_-]{16,}/g
const AUTH_HEADER = /\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)(\s*[:=]\s*)([^\r\n]+)/gi
const BEARER = /\b(bearer|basic)\s+(?!\[REDACTED\])([A-Za-z0-9._~+/=-]{12,})/gi
/** The domain ends in a letter label, so `react@18.3.1` (package@version) is not an address. */
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
const MAC = /\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
/** Full or compressed IPv6 with at least two colons-separated groups (not `::` alone, not `a::b` in C++ names). */
const IPV6 = /(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}(?![\w:])|(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){1,6}:(?:[0-9A-Fa-f]{1,4})?(?![\w:])/g
const HOME_POSIX = /(?:\/home|\/Users)\/[^/\s:'"]+/g
const HOME_ROOT = /(?<![\w/])\/root(?=\/|\s|$|['":])/g
const HOME_WINDOWS = /\b[A-Za-z]:[\\/]Users[\\/][^\\/\s:'"]+/gi
/** `scheme://host[:port]` — the host of a URL, whatever it looks like. */
const URL_HOST = /\b([a-z][a-z0-9+.-]*:\/\/)(?:[^\s/@]+@)?(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9._-]+)/gi
/**
 * A dotted host name ending in a top-level domain (the list is deliberately limited, so that file
 * names, Java packages and Rust paths such as `config.test.ts` / `com.example.Foo.bar` stay readable).
 */
const TLD = "com|net|org|jp|local|lan|internal|corp|intra|io|dev|int|home|localdomain|co|cn|id|sg|my|th|vn|us|eu|de|uk|info|biz"
const DOTTED_HOST = new RegExp(`\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+(?:${TLD})\\b(?![\\w-]|\\.[\\w-])`, "gi")

function emptyCounts(): Record<RedactionKind, number> {
  return { secret: 0, email: 0, ip: 0, mac: 0, homePath: 0, host: 0 }
}

/** Replace with a counter; `keep` returns the replacement (or null to leave the match as it is). */
function sub(text: string, re: RegExp, counts: Record<RedactionKind, number>, kind: RedactionKind, keep: (m: string, ...g: string[]) => string | null): string {
  return text.replace(re, (...args) => {
    const groups = args.slice(0, -2).filter((a): a is string => typeof a === "string")
    const out = keep(groups[0], ...groups.slice(1))
    if (out === null) return groups[0]
    counts[kind] += 1
    return out
  })
}

export function redactText(input: string, opts: { allowedHosts?: readonly string[] } = {}): RedactionResult {
  const allowed = opts.allowedHosts ?? DEFAULT_ALLOWED_HOSTS
  const counts = emptyCounts()
  let text = input.replace(/\r\n?/g, "\n")

  // 1. secrets. The git redactor first (its own count is the number of [REDACTED] it added).
  const before = (text.match(/\[REDACTED\]/g) ?? []).length
  text = redactSecrets(text)
  counts.secret += (text.match(/\[REDACTED\]/g) ?? []).length - before
  text = sub(text, AUTH_HEADER, counts, "secret", (m, name, sep, value) => (value.trim() === REDACTED ? null : `${name}${sep}${REDACTED}`))
  text = sub(text, KANFLOW_TOKEN, counts, "secret", () => REDACTED)
  text = sub(text, BEARER, counts, "secret", (_m, scheme, value) => (/\d/.test(value) || value.length >= 24 ? `${scheme} ${REDACTED}` : null))

  // 2-4. personal and network identifiers.
  text = sub(text, EMAIL, counts, "email", () => "<email>")
  text = sub(text, MAC, counts, "mac", () => "<mac>")
  text = sub(text, IPV4, counts, "ip", () => "<ip>")
  text = sub(text, IPV6, counts, "ip", (m) => (m.includes("::") || m.split(":").length >= 6 ? "<ip>" : null))
  text = sub(text, HOME_WINDOWS, counts, "homePath", () => "~")
  text = sub(text, HOME_POSIX, counts, "homePath", () => "~")
  text = sub(text, HOME_ROOT, counts, "homePath", () => "~")

  // 5. host names: URL hosts first (any name), then bare dotted names.
  text = sub(text, URL_HOST, counts, "host", (_m, scheme, host) => {
    if (host.startsWith("<") || host === "~" || hostAllowed(host, allowed)) return null
    return `${scheme}<host>`
  })
  text = sub(text, DOTTED_HOST, counts, "host", (m) => (hostAllowed(m, allowed) ? null : "<host>"))

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return { text, counts, total }
}

/** `key = value` where the key names a secret and the value is a real-looking word (not a placeholder). */
const LOOSE_ASSIGNMENT =
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential)[A-Za-z0-9_.-]*["']?\s*[:=]\s*["']?([^\s"',;<>]{6,})/gi
const LOOSE_PLACEHOLDER = /^(?:\[REDACTED\]|<.*>|\$\{.*|\$[A-Z_]+|\*+|x{3,}|string|number|required|optional|undefined|changeme|example|none|null|true|false|process\.env.*|os\.environ.*|env\(.*)$/i
const LONG_MIXED = /[A-Za-z0-9+/_=-]{40,}/g

function isPlaceholder(v: string): boolean {
  return LOOSE_PLACEHOLDER.test(v)
}

/**
 * Something in the (already redacted) text that still looks like a credential, or null.
 * Stricter than the redactor on purpose: a `password=correcthorse` the redactor let through is
 * refused here. Git hashes, UUIDs and ordinary paths are not flagged.
 */
export function findResidualSecret(redacted: string): string | null {
  if (/-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE|PGP)/.test(redacted)) return "key-block"
  for (const m of redacted.matchAll(LOOSE_ASSIGNMENT)) {
    if (!isPlaceholder(m[1])) return "secret-assignment"
  }
  for (const m of redacted.matchAll(LONG_MIXED)) {
    const v = m[0]
    if (/^[0-9a-f]+$/i.test(v)) continue // hash
    if (/^[A-Za-z]+(?:[-_][A-Za-z]+)+$/.test(v) || /^[a-z0-9_-]+(?:\/[a-z0-9_.-]+)+$/.test(v)) continue // kebab-case phrase / lower-case path
    if (/[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v)) return "long-token"
  }
  if (/\b(?:authorization|cookie)\s*[:=](?!\s*\[REDACTED\])\s*[^\r\n]{6,}/i.test(redacted)) return "auth-header"
  return null
}

/**
 * Defensive masking of secret-looking values in indexed repository text
 * (pure). Secret FILES are never read (repo-index-rules.ts); this catches a
 * token or password that was committed inside an ordinary document or
 * source file, so it can never reach the AI chat.
 *
 * Deliberately conservative on prose: `password: 必須` or `token: string` in
 * a specification table stays as written; only values that look like real
 * credentials are replaced with [REDACTED].
 */

export const REDACTED = "[REDACTED]"

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g

/** Well-known token formats (GitLab, GitHub, AWS, Slack, OpenAI-style, Google, JWT). */
const TOKEN_PATTERNS: readonly RegExp[] = [
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bgl(?:dt|rt|ptt|cbt|imt|oas|soat|ffct)-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
]

/** user:password@ inside a URL. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):([^\s@/]+)@/gi

/** `key = value` / `key: "value"` / `"key": "value"` where the key names a secret. */
const SECRET_ASSIGNMENT =
  /((?:^|[\s"'{,(])["']?[A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?key|credential)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;]+)\2/gim

/** Values in a secret assignment that are clearly placeholders / types, not credentials. */
const PLACEHOLDER = /^(?:string|number|integer|int|boolean|bool|null|none|nil|true|false|required|optional|undefined|xxx+|\*+|changeme|example|sample|dummy|your[_-].*|<.*>|\$\{.*\}|\{\{.*\}\}|%.*%|\$[A-Z_]+|process\.env\..*|env\(.*\)|os\.environ.*)$/i

/**
 * A value that plausibly is a real credential: long enough, no spaces, letters
 * AND digits (or a long mixed string). Identifiers such as psql's
 * `:'owner_pw'` or `reader_password` stay readable.
 */
function looksSecret(value: string, quoted: boolean): boolean {
  if (value.length < 8 || PLACEHOLDER.test(value)) return false
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
  // A long quoted value that is not a lower-case identifier ("SuperSecretPassphrase") is treated as a credential too.
  const quotedPhrase = quoted && value.length >= 12 && !/^[a-z0-9_.-]+$/.test(value)
  return (/\d/.test(value) && /\p{L}/u.test(value)) || (value.length >= 20 && classes >= 3) || quotedPhrase
}

/** Text with private keys, known token formats, URL passwords and secret assignments masked. */
export function redactSecrets(text: string): string {
  let out = text.replace(PRIVATE_KEY_BLOCK, `${REDACTED} (private key)`)
  for (const re of TOKEN_PATTERNS) out = out.replace(re, REDACTED)
  out = out.replace(URL_CREDENTIALS, `$1:${REDACTED}@`)
  return out.replace(SECRET_ASSIGNMENT, (whole, prefix: string, quote: string, value: string) =>
    looksSecret(value, quote !== "") && value !== REDACTED ? `${prefix}${quote}${REDACTED}${quote}` : whole,
  )
}

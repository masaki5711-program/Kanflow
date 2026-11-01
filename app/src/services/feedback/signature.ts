import crypto from "node:crypto"
import { redactText } from "./redact"

/**
 * Failure signature (W11, one rule for every reporter; pure and deterministic).
 *
 *   signature = SHA-256( tool \n errorCode \n signatureText )   (lower-case hex, 64 characters)
 *
 * signatureText is built from the REDACTED text (services/feedback/redact):
 *  1. ANSI colour codes are removed;
 *  2. timestamps → `<ts>`, UUIDs → `<uuid>`, hex values / git hashes → `<hex>`, numbers → `<n>`;
 *     absolute paths → `<path>`, query strings → `?<q>`; line / column numbers are dropped
 *     (`src/a.rs:12:5` → `src/a.rs`, `line 42` → `line`); whitespace is collapsed;
 *  3. noise lines (punctuation only, stack-frame markers) are skipped and only the first
 *     three meaningful lines are kept (each at most 300 characters).
 *
 * The same input always gives the same signature: services/feedback/__tests__/signature.vectors.json
 * pins it. Changing a rule here changes every stored signature: add a new vector, never edit one.
 */

export const SIGNATURE_LINES = 3
export const SIGNATURE_LINE_MAX = 300
export const SIGNATURE_TEXT_MAX = 1000

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const TIMESTAMP = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:\s?(?:Z|[+-]\d{2}:?\d{2}))?)?\b|\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g
const UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g
const URL_QUERY = /(\bhttps?:\/\/[^\s?#]+)\?[^\s#]*/gi
/** Absolute POSIX path (two or more segments) or Windows drive path. */
const ABS_PATH = /(?<![\w.<~/:])\/(?:[\w.@+-]+\/)+[\w.@+-]*|\b[A-Za-z]:\\(?:[^\\\s:'"]+\\)*[^\\\s:'"]*/g
/** `file.ext:12:5` / `file.ext:12` / `file.ext(12,5)` — keep the file. */
const FILE_LINE = /(\.[A-Za-z0-9]{1,6})(?::\d+){1,2}\b|(\.[A-Za-z0-9]{1,6})\(\d+(?:,\s*\d+)?\)/g
const LINE_WORD = /\b(line|lines|col|column|row)\s+\d+\b/gi
const HEX_0X = /\b0x[0-9a-fA-F]+\b/g
/** 7-64 hex characters with at least one digit and one letter a-f (git hashes, digests, ids). */
const HEX_RUN = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/gi
const NUMBER = /\b\d+(?:\.\d+)*\b/g
/** A line with nothing but marks, carets, pipes and dashes (compiler underlines, separators). */
const NOISE_ONLY = /^[^\p{L}\p{N}]*$/u
const STACK_MARKER = /^(?:stack backtrace:?|backtrace:?|traceback \(most recent call last\):?|caused by:?|note:|help:)$/i

/** Pure: one text → the normalized, line-limited signatureText (the input is expected to be redacted already). */
export function normalizeFailureText(redacted: string): string {
  const flat = redacted.replace(ANSI, "").replace(/\r\n?/g, "\n")
  const lines: string[] = []
  for (const raw of flat.split("\n")) {
    const line = normalizeLine(raw)
    if (!isMeaningful(line)) continue
    if (lines[lines.length - 1] === line) continue
    lines.push(line.length > SIGNATURE_LINE_MAX ? line.slice(0, SIGNATURE_LINE_MAX) : line)
    if (lines.length === SIGNATURE_LINES) break
  }
  return lines.join("\n").slice(0, SIGNATURE_TEXT_MAX)
}

function normalizeLine(raw: string): string {
  return raw
    .replace(URL_QUERY, "$1?<q>")
    .replace(UUID, "<uuid>")
    .replace(TIMESTAMP, "<ts>")
    .replace(ABS_PATH, "<path>")
    .replace(FILE_LINE, (_m, a: string | undefined, b: string | undefined) => a ?? b ?? "")
    .replace(LINE_WORD, (_m, w: string) => w.toLowerCase())
    .replace(HEX_0X, "<hex>")
    .replace(HEX_RUN, "<hex>")
    .replace(NUMBER, "<n>")
    .replace(/\s+/g, " ")
    .trim()
}

function isMeaningful(line: string): boolean {
  if (!line || NOISE_ONLY.test(line) || STACK_MARKER.test(line)) return false
  // Placeholders alone (e.g. "<ts> <n>") say nothing.
  return line.replace(/<[a-z]+>/g, "").replace(/[^\p{L}\p{N}]/gu, "").length >= 3
}

export function normalizeTool(tool: string): string {
  return tool.trim().toLowerCase().replace(/\s+/g, " ")
}

export function normalizeErrorCode(errorCode: string | null | undefined): string {
  return (errorCode ?? "").trim().toUpperCase()
}

export interface SignatureInput {
  tool: string
  errorCode?: string | null
  /** The raw failure text (the error output); redacted here before anything else. */
  text: string
}

export interface FailureSignature {
  signature: string
  signatureText: string
}

/** Hash of already-normalized parts (also used to re-derive a signature from stored text). */
export function hashSignature(tool: string, errorCode: string | null | undefined, signatureText: string): string {
  return crypto.createHash("sha256").update(`${normalizeTool(tool)}\n${normalizeErrorCode(errorCode)}\n${signatureText}`, "utf8").digest("hex")
}

/** Redact → normalize → hash. Deterministic: the same input always gives the same signature. */
export function computeSignature(input: SignatureInput, opts: { allowedHosts?: readonly string[] } = {}): FailureSignature {
  const redacted = redactText(input.text, opts).text
  const signatureText = normalizeFailureText(redacted)
  return { signature: hashSignature(input.tool, input.errorCode, signatureText), signatureText }
}

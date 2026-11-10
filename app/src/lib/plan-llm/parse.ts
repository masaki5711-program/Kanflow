/**
 * Validation of what the LLM answers (plan 12 §3.4 "LLM の下書きの数字の扱い"). Pure.
 *
 * An answer that is not one JSON object of the task's shape is INVALID (the caller retries once, then drops it and
 * logs). Inside a valid answer each rule draft is checked on its own and dropped with a reason when it fails:
 *
 * - the kind and numbers must pass the one rule schema (src/lib/plan-lesson-rules/rules.ts): a number outside the
 *   §2.3 limits drops the draft (it is never clamped into range);
 * - the quote must be an exact substring of the cited source's text (no paraphrase), and the source id must be one
 *   that was given; an unknown id drops the draft;
 * - item keys must be keys that were given (newKey excepted);
 * - `add_prerequisite.name` becomes plain text: NFKC, control / format characters, line breaks, markup and URLs
 *   removed, at most 80 characters — then the plain-name schema must accept it.
 * Drafts are always `project` scope (the caller stores them so; nothing here can widen them).
 */
import { z } from "zod"
import { lessonRuleSchema, RULE_KIND_ORDER, RULE_NAME_MAX, type LessonRule } from "@/lib/plan-lesson-rules/rules"
import { DRAFTS_PER_REQUEST_MAX, REVIEW_PROPOSALS_PER_REQUEST_MAX, REVIEW_QUOTE_MAX } from "./prompt"
import type { BuiltActualsReview, BuiltReview, DraftSource, RuleDraftTask } from "./visible"

/** Longest quote kept (the rule table's bound). */
export const QUOTE_MAX = 1_000
/** A quote must say something: at least this many characters. */
export const QUOTE_MIN = 4
/** Explanation text per language. */
export const EXPLANATION_MAX = 1_500

export type ParseResult<T> = { ok: true; value: T } | { ok: false; problem: string }

/** The first JSON object in a model answer (code fences and chatter around it are tolerated). */
export function extractJsonObject(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "")
  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- plain text helpers -----------------------------------

const INVISIBLE_G = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
const URL_G = /(?:[a-z][a-z0-9+.-]*:\/\/\S*|www\.\S*|\b(?:javascript|vbscript|data|file|mailto|tel|sms|blob|about|https?|ftp|wss?)\s*:\S*)/gi
/** Tags, stray angle brackets / backticks, markdown links (the label is kept), emphasis markers, HTML entities. */
const MARKUP_G = /<[^>]*>|[<>`]|\[([^\]]*)\]\([^)]*\)|\*\*|__|&[#a-z0-9]+;/gi

/** A plain item name from model text: one line, no markup, no URL, no leading formula sign, at most 80 characters. */
export function sanitizeRuleName(raw: string): string {
  let s = raw.normalize("NFKC").replace(/[\r\n\t\u2028\u2029]+/g, " ")
  s = s.replace(INVISIBLE_G, "")
  // Markdown links first (their label is kept), then any URL or URI scheme left.
  s = s.replace(MARKUP_G, (m, label: string | undefined) => (label !== undefined ? label : " "))
  s = s.replace(URL_G, " ")
  s = s.replace(/\s+/g, " ").trim().replace(/^[=+\-@\s]+/, "")
  return [...s].slice(0, RULE_NAME_MAX).join("").trim()
}

/**
 * In prose only real links, script schemes, e-mail addresses and bare host/path names are removed ("data: 3 proyek"
 * is a sentence, not a URI): nothing in the input is a contact or a link, so one in the answer can only be invented.
 */
const PROSE_URL_G = /(?:[a-z][a-z0-9+.-]*:\/\/\S*|www\.\S*|\b(?:javascript|vbscript)\s*:\S*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S*)/gi

/** Explanation text: control / format characters removed (line breaks kept), URLs removed, length capped. */
export function sanitizeExplanation(raw: string): string {
  const s = raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .replace(/[\p{Cc}]/gu, (c) => (c === "\n" ? "\n" : ""))
    .replace(PROSE_URL_G, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return [...s].slice(0, EXPLANATION_MAX).join("").trim()
}

// ---------------------------------------------------------------- rule drafts ------------------------------------------

const draftAnswerSchema = z.object({
  rules: z
    .array(
      z.object({
        kind: z.string().max(40),
        params: z.record(z.string(), z.unknown()),
        sourceId: z.string().max(300),
        quote: z.string().max(QUOTE_MAX * 4),
      })
    )
    .max(100),
})

export type DropReason = "unknown_kind" | "unknown_source" | "quote_not_in_source" | "quote_too_short" | "invalid_numbers" | "unknown_key" | "invalid_name" | "over_limit" | "duplicate"

export interface ValidDraft {
  rule: LessonRule
  source: DraftSource
  quote: string
}

export interface DraftParse {
  drafts: ValidDraft[]
  dropped: { index: number; reason: DropReason }[]
}

const KEY_PARAMS: Readonly<Record<string, readonly string[]>> = {
  scale_duration: ["key"],
  add_buffer: ["afterKey"],
  add_prerequisite: ["beforeKey"],
  add_dependency: ["from", "to"],
  split: ["key"],
  cap_parallel: [],
}

/** Validate a rule-draft answer against what was sent. Invalid as a whole → { ok: false } (retry once). */
export function parseRuleDrafts(text: string, task: RuleDraftTask): ParseResult<DraftParse> {
  const parsed = draftAnswerSchema.safeParse(extractJsonObject(text))
  if (!parsed.success) return { ok: false, problem: "expected {\"rules\":[{kind, params, sourceId, quote}]}" }
  const sources = new Map(task.sources.map((s) => [s.id, s]))
  const keys = new Set(task.items.map((i) => i.key))
  const drafts: ValidDraft[] = []
  const dropped: DraftParse["dropped"] = []
  const seen = new Set<string>()
  for (const [index, r] of parsed.data.rules.entries()) {
    const drop = (reason: DropReason) => dropped.push({ index, reason })
    if (!(RULE_KIND_ORDER as readonly string[]).includes(r.kind)) {
      drop("unknown_kind")
      continue
    }
    const source = sources.get(r.sourceId)
    if (!source) {
      drop("unknown_source")
      continue
    }
    const quote = r.quote.trim()
    if ([...quote].length < QUOTE_MIN || quote.length > QUOTE_MAX) {
      drop("quote_too_short")
      continue
    }
    // Exact: the quote is a contiguous part of the text that was sent (no normalisation that could let a rewrite pass).
    if (!source.text.includes(quote)) {
      drop("quote_not_in_source")
      continue
    }
    const params: Record<string, unknown> = { ...r.params }
    if (r.kind === "add_prerequisite") {
      if (typeof params.name !== "string") {
        drop("invalid_name")
        continue
      }
      params.name = sanitizeRuleName(params.name)
      if (params.name === "") {
        drop("invalid_name")
        continue
      }
    }
    if ((KEY_PARAMS[r.kind] ?? []).some((p) => typeof params[p] !== "string" || !keys.has(params[p] as string))) {
      drop("unknown_key")
      continue
    }
    const rule = lessonRuleSchema.safeParse({ id: `draft-${index}`, state: "draft", kind: r.kind, params })
    if (!rule.success) {
      drop(r.kind === "add_prerequisite" && rule.error.issues.some((i) => i.path.includes("name")) ? "invalid_name" : "invalid_numbers")
      continue
    }
    const fingerprint = JSON.stringify([rule.data.kind, rule.data.params])
    if (seen.has(fingerprint)) {
      drop("duplicate")
      continue
    }
    if (drafts.length >= DRAFTS_PER_REQUEST_MAX) {
      drop("over_limit")
      continue
    }
    seen.add(fingerprint)
    drafts.push({ rule: rule.data, source, quote })
  }
  return { ok: true, value: { drafts, dropped } }
}

// ---------------------------------------------------------------- candidate review -------------------------------------

const reviewAnswerSchema = z.object({ accept: z.array(z.string().max(20)).max(1_000) })

/** With this many candidates sent, an answer that keeps none is treated as invalid. */
export const REJECT_ALL_SUSPECT_MIN = 4

export interface CandidateDecision {
  /** Snapshot item ids rejected per leaf key (only candidates that were sent). */
  rejected: Record<string, string[]>
  rejectedCount: number
}

/**
 * The LLM returns the subset of candidate ids to KEEP; every other candidate that was sent is rejected. Unknown ids
 * are ignored (they can neither add a candidate nor touch one that was not sent).
 */
export function parseCandidateReview(text: string, built: BuiltReview): ParseResult<CandidateDecision> {
  const parsed = reviewAnswerSchema.safeParse(extractJsonObject(text))
  if (!parsed.success) return { ok: false, problem: 'expected {"accept":["c1",…]}' }
  const keep = new Set(parsed.data.accept.filter((cid) => built.candidates.has(cid)))
  // Rejecting every one of many candidates is more likely a manipulated or careless answer than a judgement: the formula.
  if (keep.size === 0 && built.candidates.size >= REJECT_ALL_SUSPECT_MIN) return { ok: false, problem: "every candidate was rejected" }
  const rejected: Record<string, string[]> = {}
  let rejectedCount = 0
  for (const [cid, c] of built.candidates) {
    if (keep.has(cid)) continue
    ;(rejected[c.key] ??= []).push(c.snapshotItemId)
    rejectedCount++
  }
  for (const k of Object.keys(rejected)) rejected[k].sort()
  return { ok: true, value: { rejected, rejectedCount } }
}

// ---------------------------------------------------------------- explanation ------------------------------------------

const explanationAnswerSchema = z.object({ ja: z.string(), en: z.string(), id: z.string() })

export interface ExplanationText {
  ja: string
  en: string
  id: string
}

export function parseExplanation(text: string): ParseResult<ExplanationText> {
  const parsed = explanationAnswerSchema.safeParse(extractJsonObject(text))
  if (!parsed.success) return { ok: false, problem: 'expected {"ja":"…","en":"…","id":"…"}' }
  const out = { ja: sanitizeExplanation(parsed.data.ja), en: sanitizeExplanation(parsed.data.en), id: sanitizeExplanation(parsed.data.id) }
  if (!out.ja || !out.en || !out.id) return { ok: false, problem: "every language needs a text" }
  return { ok: true, value: out }
}

// ---------------------------------------------------------------- actuals review ---------------------------------------

export const REVIEW_KINDS = ["exclude_from_learning", "treat_as_waiting"] as const
export type ReviewKind = (typeof REVIEW_KINDS)[number]
export const REVIEW_CONFIDENCES = ["low", "medium", "high"] as const
export type ReviewConfidence = (typeof REVIEW_CONFIDENCES)[number]

const reviewProposalAnswerSchema = z.object({
  proposals: z
    .array(
      z.object({
        iid: z.string().max(20),
        kind: z.string().max(40),
        quote: z.string().max(REVIEW_QUOTE_MAX * 4),
        confidence: z.string().max(20),
      })
    )
    .max(200),
})

export type ReviewDropReason = "unknown_item" | "unknown_kind" | "unknown_confidence" | "quote_too_short" | "quote_not_in_source" | "not_applicable" | "duplicate" | "over_limit"

export interface ValidReviewProposal {
  snapshotItemId: string
  kind: ReviewKind
  quote: string
  /** item = the leaf's own name / notes (preferred when both contain it) | note = the finalize note. */
  quoteSource: "item" | "note"
  confidence: ReviewConfidence
}

export interface ReviewParse {
  proposals: ValidReviewProposal[]
  dropped: { index: number; reason: ReviewDropReason }[]
}

/**
 * Validate an actuals-review answer against what was sent. Invalid as a whole → { ok: false } (retry once, never with
 * the answer). Each proposal is checked on its own: an item that was sent, a known kind and confidence, a quote of 4 to
 * 300 characters that is an exact part of THAT item's name or notes or of the note, treat_as_waiting only for a leaf
 * whose actual days exceed its planned days, one proposal per item, at most 10.
 */
export function parseActualsReview(text: string, built: BuiltActualsReview): ParseResult<ReviewParse> {
  const parsed = reviewProposalAnswerSchema.safeParse(extractJsonObject(text))
  if (!parsed.success) return { ok: false, problem: 'expected {"proposals":[{iid, kind, quote, confidence}]}' }
  const note = built.input.note
  const proposals: ValidReviewProposal[] = []
  const dropped: ReviewParse["dropped"] = []
  const seen = new Set<string>()
  for (const [index, p] of parsed.data.proposals.entries()) {
    const drop = (reason: ReviewDropReason) => dropped.push({ index, reason })
    const item = built.items.get(p.iid)
    if (!item) {
      drop("unknown_item")
      continue
    }
    if (!(REVIEW_KINDS as readonly string[]).includes(p.kind)) {
      drop("unknown_kind")
      continue
    }
    if (!(REVIEW_CONFIDENCES as readonly string[]).includes(p.confidence)) {
      drop("unknown_confidence")
      continue
    }
    const quote = p.quote.trim()
    if ([...quote].length < QUOTE_MIN || [...quote].length > REVIEW_QUOTE_MAX) {
      drop("quote_too_short")
      continue
    }
    // Exact: a contiguous part of what was sent for this item, or of the note (no normalisation).
    const fromItem = item.name.includes(quote) || item.notes.includes(quote)
    if (!fromItem && !(note !== "" && note.includes(quote))) {
      drop("quote_not_in_source")
      continue
    }
    if (p.kind === "treat_as_waiting" && !(item.actualDays !== null && item.plannedDays !== null && item.actualDays > item.plannedDays)) {
      drop("not_applicable")
      continue
    }
    if (seen.has(item.snapshotItemId)) {
      drop("duplicate")
      continue
    }
    if (proposals.length >= REVIEW_PROPOSALS_PER_REQUEST_MAX) {
      drop("over_limit")
      continue
    }
    seen.add(item.snapshotItemId)
    proposals.push({ snapshotItemId: item.snapshotItemId, kind: p.kind as ReviewKind, quote, quoteSource: fromItem ? "item" : "note", confidence: p.confidence as ReviewConfidence })
  }
  return { ok: true, value: { proposals, dropped } }
}

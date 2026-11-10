/**
 * What may reach the LLM (plan 12 §3.4 "LLM に渡すもの", §4). The ONE prompt builder (`buildPrompt`, ./prompt.ts)
 * accepts only a `VisibleLlmInput`, and the only way to make one is a constructor below. Each constructor takes the
 * raw facts WITH their visibility (source project, confidential now, in the visible set) and keeps only what the
 * requester may see:
 *
 * - rule drafts: text of THIS project only (sprint retrospectives, the finalize note, confirmed lessons of
 *   `project:<id>` that are not confidential NOW — checked by the caller at use time and again here);
 * - candidate review: visible-source candidates of stages 3 / 4 only (a hidden-source candidate — even its item name —
 *   never leaves the server; the formula alone decides it);
 * - explanation: names of the sources every estimator can see; everything else folds into "other projects n (band)"
 *   with rounded numbers. Never a quote of a rule.
 * - actuals review: THIS project's finalized leaves (name, days, plan-item notes) and its finalize note; a leaf citing
 *   a PBI that is confidential NOW (checked by the caller at use time) is never sent, not even its name. No owner.
 *
 * Each constructor also returns the source ids it let through, so the caller records them (the run's llmSourceIds,
 * the draft job's sourceIds). Pure.
 */
import { countBand } from "@/lib/plan-estimate/hidden"
import { roundTenth } from "@/lib/plan-estimate/stats"

const VISIBLE: unique symbol = Symbol("plan-llm.visible-input")

/** Per text source sent for rule drafts. */
export const DRAFT_SOURCE_TEXT_MAX = 2_000
/** Sources per rule-draft request (newest first by the caller). */
export const DRAFT_SOURCES_MAX = 40
/** Plan item keys offered to the rule drafts (so a draft names real keys). */
export const DRAFT_ITEMS_MAX = 200
/** Leaves per candidate-review request, and candidates per leaf; the rest are decided by the formula alone. */
export const REVIEW_LEAVES_MAX = 40
export const REVIEW_CANDIDATES_PER_LEAF_MAX = 10
/** Leaves described to the explanation (the largest changes). */
export const EXPLAIN_LEAVES_MAX = 20
/** Named sources per explained leaf. */
export const EXPLAIN_SOURCES_PER_LEAF_MAX = 10
/**
 * Most characters of the JSON data block of one prompt. The shared Ollama context is OLLAMA_NUM_CTX = 12 288 tokens,
 * of which 2 048 are kept for the answer and ~1 500 for the system message; Japanese is close to one token per
 * character, so characters are counted, with room to spare. Whole entries are left out past it (never cut in half),
 * newest / most relevant first, and the count left out is returned (`omitted`).
 */
export const PROMPT_DATA_CHARS_MAX = 6_000
/** Of which the item list of a rule-draft request may take at most this much (names go before keys). */
export const DRAFT_ITEMS_CHARS_MAX = 2_000

/**
 * The JSON of the data block as sent: "<", ">", "&" and the line / paragraph separators become \\u escapes (the same
 * JSON value), so the text can never spell the block's end marker. The budget below measures THIS form.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
}

/** Adds entries while the running JSON size stays within the budget; returns how many did not fit. */
class Budget {
  private used: number
  omitted = 0
  constructor(base: unknown, private readonly max = PROMPT_DATA_CHARS_MAX) {
    this.used = safeJson(base).length
  }
  fits(entry: unknown): boolean {
    const size = safeJson(entry).length + 1
    if (this.used + size > this.max) {
      this.omitted++
      return false
    }
    this.used += size
    return true
  }
}

export type DraftSourceKind = "retro_problem" | "retro_try" | "lesson" | "finalize_note"

export interface DraftSource {
  /** Opaque, server-made: "sprint:<id>:problem", "lesson:<id>", "note:<snapshotId>". */
  id: string
  kind: DraftSourceKind
  text: string
}

export interface RuleDraftTask {
  task: "rule_drafts"
  sources: DraftSource[]
  /** The project's plan items (template keys and names), for the keys a rule may name. */
  items: { key: string; name: string }[]
}

export interface ReviewCandidate {
  /** Opaque per request ("c1", "c2", …); the server maps it back. */
  cid: string
  name: string
  stage: 3 | 4
  similarity: number
}

export interface CandidateReviewTask {
  task: "candidate_review"
  leaves: { key: string; name: string; candidates: ReviewCandidate[] }[]
}

export type Band = "~3" | "4-9" | "10+"

export interface ExplanationLeaf {
  key: string
  name: string
  /** null = the item was added by a lesson rule. */
  templateDays: number | null
  days: number
  p80Days: number | null
  /** The P50 ratio, always rounded to 0.1 (null when not estimated). */
  ratio: number | null
  /** Sources every estimator can see, by name. */
  sources: { projectName: string; itemName: string }[]
  /** Everything else: a band, never a name or a per-source number. */
  otherProjects: Band | null
  addedByRule: boolean
}

export interface ExplanationTask {
  task: "explanation"
  summary: {
    templateEnd: string
    p50End: string
    p80End: string
    plannedEnd: string
    bufferDays: number
    estimateOn: boolean
    matchedProjects: Band | null
  }
  /** Applied lesson rules: kind and numbers only (never a quote, never a name). */
  rules: { kind: string; numbers: Record<string, number> }[]
  leaves: ExplanationLeaf[]
}

/** One finalized leaf as the actuals review reads it (an opaque iid per request; the server maps it back). */
export interface ReviewItem {
  iid: string
  name: string
  plannedDays: number | null
  actualDays: number | null
  endSlipDays: number | null
  waitGapDays: number | null
  onHoldDays: number | null
  /** The plan row's description and notes (project-internal text), "" when none. */
  notes: string
}

export interface ActualsReviewTask {
  task: "actuals_review"
  /** The finalize note (確定の時のメモ), "" when none. */
  note: string
  items: ReviewItem[]
}

export type LlmTask = RuleDraftTask | CandidateReviewTask | ExplanationTask | ActualsReviewTask
export type VisibleLlmInput = LlmTask & { readonly [VISIBLE]: true }

function brand<T extends LlmTask>(task: T): T & { readonly [VISIBLE]: true } {
  const branded: T & { readonly [VISIBLE]: true } = { ...task, [VISIBLE]: true as const }
  return Object.freeze(branded)
}

/** Is this value a constructor-made input? (The prompt builder refuses anything else, also at run time.) */
export function isVisibleInput(value: unknown): value is VisibleLlmInput {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[VISIBLE] === true
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

// ---------------------------------------------------------------- rule drafts ------------------------------------------

export interface RawDraftSource extends DraftSource {
  /** The project the text belongs to. */
  projectId: string
  /** Confidential NOW (lessons; looked up at use time). Retrospectives and notes have no mark: false. */
  confidential: boolean
}

export interface Built<T extends LlmTask> {
  input: T & { readonly [VISIBLE]: true }
  /** Source ids given to the LLM. */
  sourceIds: string[]
  /** Entries left out to keep the prompt inside the context window (sources, candidates or leaves). */
  omitted: number
}

/** Line breaks and tabs stay; other controls and invisible format characters go (a quote is checked against this). */
function plainSourceText(raw: string, max: number): string {
  return clip(
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, "")
      .replace(/\p{Cc}/gu, (c) => (c === "\n" || c === "\t" ? c : ""))
      .trim(),
    max
  )
}

/** Rule drafts at actuals finalization: this project's non-confidential text only. Empty texts are skipped. */
export function ruleDraftInput(projectId: string, raw: readonly RawDraftSource[], items: readonly { key: string; name: string }[]): Built<RuleDraftTask> {
  const sources: DraftSource[] = []
  // The item keys go first (small; a draft must name them), then the texts in the order given (newest first).
  const seen = new Set<string>()
  const keys: { key: string; name: string }[] = []
  const itemBudget = new Budget([], DRAFT_ITEMS_CHARS_MAX)
  for (const i of items) {
    if (keys.length >= DRAFT_ITEMS_MAX) break
    if (seen.has(i.key)) continue
    seen.add(i.key)
    const entry = { key: i.key, name: clip(i.name, 200) }
    // A long name gives way to its key alone; a key that does not fit either is left out.
    if (itemBudget.fits(entry)) keys.push(entry)
    else if (itemBudget.fits({ key: i.key, name: "" })) keys.push({ key: i.key, name: "" })
  }
  const budget = new Budget({ task: "rule_drafts", sources: [], items: keys })
  for (const s of raw) {
    if (sources.length >= DRAFT_SOURCES_MAX) break
    if (s.projectId !== projectId || s.confidential) continue
    const text = plainSourceText(s.text, DRAFT_SOURCE_TEXT_MAX)
    if (!text) continue
    const entry = { id: s.id, kind: s.kind, text }
    if (budget.fits(entry)) sources.push(entry)
  }
  return { input: brand({ task: "rule_drafts", sources, items: keys }), sourceIds: sources.map((s) => s.id), omitted: budget.omitted }
}

// ---------------------------------------------------------------- candidate review -------------------------------------

export interface RawCandidate {
  snapshotItemId: string
  sourceProjectId: string
  name: string
  stage: 1 | 2 | 3 | 4
  similarity: number
}

export interface RawCandidateLeaf {
  key: string
  name: string
  candidates: readonly RawCandidate[]
}

export interface BuiltReview extends Built<CandidateReviewTask> {
  /** cid → (leaf key, snapshot item id) of every candidate sent. */
  candidates: ReadonlyMap<string, { key: string; snapshotItemId: string }>
}

/**
 * Candidate review at proposal time: stage-3 / 4 candidates of sources in `visibleProjectIds` only (the run's visible
 * set: projects the creator and every PO / SM can view). Others are not sent and stay decided by the formula.
 */
export function candidateReviewInput(raw: readonly RawCandidateLeaf[], visibleProjectIds: ReadonlySet<string>): BuiltReview {
  const map = new Map<string, { key: string; snapshotItemId: string }>()
  const sourceIds = new Set<string>()
  const leaves: CandidateReviewTask["leaves"] = []
  const budget = new Budget({ task: "candidate_review", leaves: [] })
  for (const leaf of raw) {
    if (leaves.length >= REVIEW_LEAVES_MAX) break
    const head = { key: leaf.key, name: clip(leaf.name, 200), candidates: [] }
    const visible = leaf.candidates.filter((c) => (c.stage === 3 || c.stage === 4) && visibleProjectIds.has(c.sourceProjectId)).slice(0, REVIEW_CANDIDATES_PER_LEAF_MAX)
    // A leaf goes in whole or not at all (a candidate left out is decided by the formula, like a hidden one).
    const entry = { ...head, candidates: visible.map((c, i) => ({ cid: `c${map.size + i + 1}`, name: clip(c.name, 200), stage: c.stage as 3 | 4, similarity: Math.round(c.similarity * 100) / 100 })) }
    if (visible.length === 0 || !budget.fits(entry)) continue
    for (const [i, c] of visible.entries()) {
      map.set(entry.candidates[i].cid, { key: leaf.key, snapshotItemId: c.snapshotItemId })
      sourceIds.add(c.sourceProjectId)
    }
    leaves.push(entry)
  }
  return { input: brand({ task: "candidate_review", leaves }), sourceIds: [...sourceIds].sort(), candidates: map, omitted: budget.omitted }
}

// ---------------------------------------------------------------- explanation ------------------------------------------

export interface RawExplanationLeaf {
  key: string
  name: string
  templateDays: number | null
  days: number
  p80Days: number | null
  ratio: number | null
  /** Visible-at-creation sources, by project (the item name is the source's own leaf name). */
  sources: readonly { sourceProjectId: string; projectName: string; itemName: string }[]
  /** Hidden-source projects of the leaf (never named). */
  hiddenProjectCount: number
  addedByRule: boolean
}

/** Numbers of a rule's params (kind + numbers only: keys, names and quotes stay out). */
export function ruleNumbers(params: unknown): Record<string, number> {
  if (typeof params !== "object" || params === null) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v
  return out
}

/**
 * The explanation input: names only of sources in `intersection` (what every explicit PO / SM holding plan.estimate,
 * and the requester, can view); any other source of a leaf folds into "other projects n (band)" and the leaf's ratio
 * is rounded to 0.1. Returns the source project ids whose names were given.
 */
export function explanationInput(
  summary: ExplanationTask["summary"],
  rules: readonly { kind: string; params: unknown }[],
  raw: readonly RawExplanationLeaf[],
  intersection: ReadonlySet<string>
): Built<ExplanationTask> {
  // Only names that are actually in the input are recorded (a source or leaf left out below was not given).
  const given = new Set<string>()
  const ruleEntries = rules.map((r) => ({ kind: r.kind, numbers: ruleNumbers(r.params) }))
  const budget = new Budget({ task: "explanation", summary, rules: ruleEntries, leaves: [] })
  const all: ExplanationLeaf[] = raw.slice(0, EXPLAIN_LEAVES_MAX).map((l) => {
    const shown = l.sources.filter((s) => intersection.has(s.sourceProjectId)).slice(0, EXPLAIN_SOURCES_PER_LEAF_MAX)
    const folded = new Set(l.sources.filter((s) => !intersection.has(s.sourceProjectId)).map((s) => s.sourceProjectId)).size + l.hiddenProjectCount
    return {
      key: l.key,
      name: clip(l.name, 200),
      templateDays: l.templateDays,
      days: l.days,
      p80Days: l.p80Days,
      ratio: l.ratio === null ? null : roundTenth(l.ratio),
      sources: shown.map((s) => ({ projectName: clip(s.projectName, 200), itemName: clip(s.itemName, 200) })),
      otherProjects: folded > 0 ? countBand(folded) : null,
      addedByRule: l.addedByRule,
    }
  })
  const leaves: ExplanationLeaf[] = []
  for (const [i, leaf] of all.entries()) {
    if (!budget.fits(leaf)) continue
    leaves.push(leaf)
    for (const s of raw[i].sources.filter((x) => intersection.has(x.sourceProjectId)).slice(0, EXPLAIN_SOURCES_PER_LEAF_MAX)) given.add(s.sourceProjectId)
  }
  return {
    input: brand({ task: "explanation", summary: { ...summary }, rules: ruleEntries, leaves }),
    sourceIds: [...given].sort(),
    omitted: budget.omitted,
  }
}

// ---------------------------------------------------------------- actuals review ---------------------------------------

/** Leaves offered to one actuals review (the caller orders them: the largest deviation first). */
export const REVIEW_ITEMS_MAX = 60
/** Characters of a leaf's notes sent. */
export const REVIEW_NOTES_MAX = 500
/** Characters of the finalize note sent (the column's own bound). */
export const REVIEW_NOTE_MAX = 2_000

export interface RawReviewItem {
  snapshotItemId: string
  /** The project of the snapshot the leaf belongs to. */
  projectId: string
  name: string
  plannedDays: number | null
  actualDays: number | null
  endSlipDays: number | null
  waitGapDays: number | null
  onHoldDays: number | null
  notes: string | null
  /** The leaf cites a PBI that is confidential, trashed or gone NOW (looked up at use time). */
  confidentialNow: boolean
}

/** How unusual a leaf looks (the order leaves are offered in, so a cut prompt keeps the likeliest ones). */
export function reviewDeviation(i: { plannedDays: number | null; actualDays: number | null; waitGapDays: number | null; onHoldDays: number | null }): number {
  const slip = i.actualDays !== null && i.plannedDays !== null ? Math.abs(i.actualDays - i.plannedDays) / Math.max(i.plannedDays, 1) : 0
  return slip + ((i.waitGapDays ?? 0) + (i.onHoldDays ?? 0)) / Math.max(i.plannedDays ?? 1, 1)
}

/** The order the batch offers leaves in: the largest deviation first, then by id (the evaluation harness uses it too). */
export function byReviewOrder(a: RawReviewItem, b: RawReviewItem): number {
  return reviewDeviation(b) - reviewDeviation(a) || (a.snapshotItemId < b.snapshotItemId ? -1 : 1)
}

export interface SentReviewItem {
  snapshotItemId: string
  /** The leaf's text as sent (name and notes): a quote must be part of it or of the note. */
  name: string
  notes: string
  plannedDays: number | null
  actualDays: number | null
}

export interface BuiltActualsReview extends Built<ActualsReviewTask> {
  /** iid → the leaf it stands for (only leaves that were sent). */
  items: ReadonlyMap<string, SentReviewItem>
}

/**
 * The actuals review of one finalized snapshot: the note first (when it fits), then whole leaves in the order given
 * until the budget is used (a leaf is never cut in half; `omitted` counts the leaves and the note left out). Leaves of
 * another project and leaves citing a PBI that is confidential now are never sent. sourceIds: "note:<snapshotId>" and
 * "item:<snapshotItemId>" of what was sent.
 */
export function actualsReviewInput(projectId: string, note: { snapshotId: string; text: string | null } | null, raw: readonly RawReviewItem[]): BuiltActualsReview {
  const budget = new Budget({ task: "actuals_review", note: "", items: [] })
  const sourceIds: string[] = []
  let noteText = note?.text ? plainSourceText(note.text, REVIEW_NOTE_MAX) : ""
  if (noteText && note) {
    // The note travels as a string value of the base object: measure it as the growth of that value.
    if (budget.fits(noteText)) sourceIds.push(`note:${note.snapshotId}`)
    else noteText = ""
  }
  const items: ReviewItem[] = []
  const map = new Map<string, SentReviewItem>()
  for (const r of raw) {
    if (items.length >= REVIEW_ITEMS_MAX) break
    if (r.projectId !== projectId || r.confidentialNow) continue
    const name = plainSourceText(r.name, 200)
    const notes = r.notes ? plainSourceText(r.notes, REVIEW_NOTES_MAX) : ""
    const entry: ReviewItem = { iid: `i${map.size + 1}`, name, plannedDays: r.plannedDays, actualDays: r.actualDays, endSlipDays: r.endSlipDays, waitGapDays: r.waitGapDays, onHoldDays: r.onHoldDays, notes }
    if (!budget.fits(entry)) continue
    items.push(entry)
    map.set(entry.iid, { snapshotItemId: r.snapshotItemId, name, notes, plannedDays: r.plannedDays, actualDays: r.actualDays })
    sourceIds.push(`item:${r.snapshotItemId}`)
  }
  return { input: brand({ task: "actuals_review", note: noteText, items }), sourceIds, omitted: budget.omitted, items: map }
}

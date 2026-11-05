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

export type LlmTask = RuleDraftTask | CandidateReviewTask | ExplanationTask
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
}

/** Rule drafts at actuals finalization: this project's non-confidential text only. Empty texts are skipped. */
export function ruleDraftInput(projectId: string, raw: readonly RawDraftSource[], items: readonly { key: string; name: string }[]): Built<RuleDraftTask> {
  const sources: DraftSource[] = []
  for (const s of raw) {
    if (sources.length >= DRAFT_SOURCES_MAX) break
    if (s.projectId !== projectId || s.confidential) continue
    // Line breaks and tabs stay; other controls and invisible format characters go (a quote is checked against this).
    const text = clip(
      s.text
        .replace(/\r\n?/g, "\n")
        .replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, "")
        .replace(/\p{Cc}/gu, (c) => (c === "\n" || c === "\t" ? c : ""))
        .trim(),
      DRAFT_SOURCE_TEXT_MAX
    )
    if (!text) continue
    sources.push({ id: s.id, kind: s.kind, text })
  }
  const seen = new Set<string>()
  const keys = items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true))).slice(0, DRAFT_ITEMS_MAX)
  return { input: brand({ task: "rule_drafts", sources, items: keys.map((i) => ({ key: i.key, name: clip(i.name, 200) })) }), sourceIds: sources.map((s) => s.id) }
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
  for (const leaf of raw) {
    if (leaves.length >= REVIEW_LEAVES_MAX) break
    const candidates: ReviewCandidate[] = []
    for (const c of leaf.candidates) {
      if (candidates.length >= REVIEW_CANDIDATES_PER_LEAF_MAX) break
      if ((c.stage !== 3 && c.stage !== 4) || !visibleProjectIds.has(c.sourceProjectId)) continue
      const cid = `c${map.size + 1}`
      map.set(cid, { key: leaf.key, snapshotItemId: c.snapshotItemId })
      sourceIds.add(c.sourceProjectId)
      candidates.push({ cid, name: clip(c.name, 200), stage: c.stage, similarity: Math.round(c.similarity * 100) / 100 })
    }
    if (candidates.length > 0) leaves.push({ key: leaf.key, name: clip(leaf.name, 200), candidates })
  }
  return { input: brand({ task: "candidate_review", leaves }), sourceIds: [...sourceIds].sort(), candidates: map }
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
  // Only names that are actually in the input are recorded (a source sliced off below was not given).
  const given = new Set<string>()
  const leaves: ExplanationLeaf[] = raw.slice(0, EXPLAIN_LEAVES_MAX).map((l) => {
    const shown = l.sources.filter((s) => intersection.has(s.sourceProjectId)).slice(0, EXPLAIN_SOURCES_PER_LEAF_MAX)
    const folded = new Set(l.sources.filter((s) => !intersection.has(s.sourceProjectId)).map((s) => s.sourceProjectId)).size + l.hiddenProjectCount
    for (const s of shown) given.add(s.sourceProjectId)
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
  return {
    input: brand({ task: "explanation", summary: { ...summary }, rules: rules.map((r) => ({ kind: r.kind, numbers: ruleNumbers(r.params) })), leaves }),
    sourceIds: [...given].sort(),
  }
}

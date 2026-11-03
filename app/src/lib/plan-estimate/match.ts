/**
 * Matching (plan 12 §3.1): which past observations inform a leaf, how similar they are (s_j) and how much they
 * weigh (w_j = s_j × 0.5^(age / H), age counted from R). Only observations whose project closed AND was finalized
 * before R are used (no information from the future, and the proposed start date plays no part).
 */
import { dayNumber } from "./dates"
import { trigramSimilarity } from "./trigram"
import type { EstimateConfig, EstimateContext, EstimateLeaf, Observation } from "./types"

export interface MatchedObservation {
  obs: Observation
  stage: 1 | 2 | 3 | 4
  similarity: number
  /** w_j */
  weight: number
  /** x_j = ln(A_j / P_j) */
  x: number
  visible: boolean
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Observations usable at R: closed and finalized strictly before it, with positive planned and actual days. */
export function usableAt(observations: readonly Observation[], referenceDate: string): Observation[] {
  const r = dayNumber(referenceDate)
  return observations.filter((o) => dayNumber(o.closedAt) < r && dayNumber(o.finalizedAt) < r && o.plannedDays > 0 && o.actualDays > 0)
}

/** 0.5^(age / H): the recency factor of an observation. */
export function recency(closedAt: string, referenceDate: string, halfLifeDays: number): number {
  const age = Math.max(0, dayNumber(referenceDate) - dayNumber(closedAt))
  return Math.pow(0.5, age / halfLifeDays)
}

function stageOf(leaf: EstimateLeaf, obs: Observation, ctx: EstimateContext, cfg: EstimateConfig, similarity: (a: string, b: string) => number): { stage: 1 | 2 | 3 | 4; s: number } | null {
  const keyMatch = obs.templateKey !== null && (obs.templateKey === leaf.key || (leaf.formerKeys ?? []).includes(obs.templateKey))
  if (keyMatch && obs.lineage === ctx.lineage) return { stage: 1, s: 1.0 }
  if (obs.projectType !== ctx.projectType) return null
  if (keyMatch) return { stage: 2, s: 0.7 }
  const sim = similarity(leaf.name, obs.name)
  const sharesAttribute = obs.attributes.some((a) => ctx.attributes.includes(a))
  if (sharesAttribute && sim >= cfg.stage3MinSimilarity) return { stage: 3, s: 0.5 * sim }
  if (sim >= cfg.stage4MinSimilarity) return { stage: 4, s: 0.3 * sim }
  return null
}

/**
 * The observations of one leaf. `usable` must already be cut at R (`usableAt`). Stages 3–4 are dropped when
 * stage 1 has `stage1Enough` observations (visible ones, plus the hidden ones only once they are usable at all:
 * h' ≥ 4 projects — the presence of fewer hidden projects must not change anything).
 */
export function matchLeaf(leaf: EstimateLeaf, usable: readonly Observation[], ctx: EstimateContext, cfg: EstimateConfig): MatchedObservation[] {
  const similarity = ctx.similarity ?? trigramSimilarity
  const matched: MatchedObservation[] = []
  // Canonical order (project, snapshot item): the result never depends on the order rows were read in.
  const ordered = usable.toSorted((a, b) => cmp(a.sourceProjectId, b.sourceProjectId) || cmp(a.snapshotItemId, b.snapshotItemId))
  for (const obs of ordered) {
    const st = stageOf(leaf, obs, ctx, cfg, similarity)
    if (!st) continue
    matched.push({
      obs,
      stage: st.stage,
      similarity: st.s,
      weight: st.s * recency(obs.closedAt, ctx.referenceDate, cfg.halfLifeDays),
      x: Math.log(obs.actualDays / obs.plannedDays),
      visible: ctx.visibleProjectIds.has(obs.sourceProjectId),
    })
  }
  const stage1 = matched.filter((m) => m.stage === 1)
  const visibleStage1 = stage1.filter((m) => m.visible).length
  const hiddenStage1Projects = new Set(stage1.filter((m) => !m.visible).map((m) => m.obs.sourceProjectId)).size
  const hiddenUsable = hiddenStage1Projects >= cfg.minHiddenSources ? Math.floor(hiddenStage1Projects / 2) * 2 : 0
  const stage1Count = visibleStage1 + (hiddenUsable >= 4 ? hiddenUsable : 0)
  return stage1Count >= cfg.stage1Enough ? matched.filter((m) => m.stage <= 2) : matched
}

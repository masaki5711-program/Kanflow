/**
 * Display-safe views of an estimate (plan 12 §3.2 rules 3–5, §4). The engine's `LeafEstimate` / `PlanEstimate` are
 * internal (exact n and α, hidden project ids, exact μ0, held hidden states); every screen, card, MCP response and
 * LLM prompt goes through these functions instead:
 *  - counts as bands, never exact (`countBand`), α not shown;
 *  - ratios rounded to 0.1 (they already are when a hidden source took effect);
 *  - hidden sources as ONE line "other projects (band)", no ids, no per-source rows;
 *  - μ0 is omitted when hidden sources shaped it.
 * Source names are resolved later with the READER's permissions (E5); this view carries visible ids only.
 */
import { countBand } from "./hidden"
import { roundTenth } from "./stats"
import type { LeafEstimate, SourceRef, TypePrior } from "./types"
import type { PlanEstimate } from "./plan"

export interface DisplaySource {
  snapshotItemId: string
  sourceProjectId: string
  stage: 1 | 2 | 3 | 4
  ratio: number
}

export interface DisplayLeaf {
  key: string
  templateDays: number
  d50: number
  d80: number
  r50: number
  r80: number
  observations: "~3" | "4-9" | "10+"
  typePriorOnly: boolean
  /** "Includes other projects' actuals (band)"; null when no hidden source took effect. */
  otherProjects: "~3" | "4-9" | "10+" | null
  sources: DisplaySource[]
  /** Visible outliers only; a hidden-influenced leaf shows just the combined count. */
  droppedCount: number
  lagDays: number
  load: number
  mrSet: LeafEstimate["mrSet"]
}

const toSource = (s: SourceRef): DisplaySource => ({ snapshotItemId: s.snapshotItemId, sourceProjectId: s.sourceProjectId, stage: s.stage, ratio: roundTenth(Math.exp(s.logRatio)) })

export function displayLeaf(leaf: LeafEstimate): DisplayLeaf {
  return {
    key: leaf.key,
    templateDays: leaf.templateDays,
    d50: leaf.d50,
    d80: leaf.d80,
    r50: roundTenth(leaf.r50),
    r80: roundTenth(leaf.r80),
    observations: countBand(leaf.n),
    typePriorOnly: leaf.typePriorOnly,
    otherProjects: leaf.hiddenInfluenced ? countBand(leaf.hiddenSourceProjectIds.length) : null,
    sources: leaf.kept.map(toSource),
    droppedCount: leaf.dropped.length,
    lagDays: leaf.lagDays,
    load: leaf.load,
    mrSet: leaf.mrSet,
  }
}

export interface DisplayTypePrior {
  /** Rounded ratio of the type trend; null when hidden sources shaped it. */
  ratio: number | null
  observations: "~3" | "4-9" | "10+"
}

export function displayTypePrior(prior: TypePrior): DisplayTypePrior {
  return { ratio: prior.hiddenInfluenced ? null : roundTenth(Math.exp(prior.mu0)), observations: countBand(prior.n) }
}

export interface DisplayPlan {
  methodVersion: string
  templateEnd: string
  p50End: string
  p80End: string
  bufferDays: number
  criticalKeys: string[]
  typePrior: DisplayTypePrior
  leaves: DisplayLeaf[]
}

export function displayPlan(plan: PlanEstimate): DisplayPlan {
  return {
    methodVersion: plan.methodVersion,
    templateEnd: plan.templateEnd,
    p50End: plan.p50End,
    p80End: plan.p80End,
    bufferDays: plan.bufferDays,
    criticalKeys: [...plan.criticalKeys],
    typePrior: displayTypePrior(plan.typePrior),
    leaves: plan.leaves.map(displayLeaf),
  }
}

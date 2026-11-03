/** Estimate engine (plan 12 E2): pure functions; DB reads (E1) and runs / evidence (E5) live elsewhere. */
export { ESTIMATE_DEFAULTS, ESTIMATE_METHOD_VERSION } from "./types"
export type { EstimateConfig, EstimateContext, EstimateLeaf, HiddenState, LeafEstimate, Observation, SourceRef, TypePrior } from "./types"
export { referenceDateOf } from "./dates"
export { countBand } from "./hidden"
export { estimateLeaf, learnParallelCap, typePrior, type ParallelPeak } from "./estimate"
export { estimatePlan, criticalChain, type PlanEstimate } from "./plan"
export { runBacktest, observationsOf, type BacktestProject, type BacktestReport } from "./backtest"
export { trigramSimilarity } from "./trigram"

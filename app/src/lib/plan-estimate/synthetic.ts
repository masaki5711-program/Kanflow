/**
 * Synthetic portfolio for the backtest (plan 12 §8 item 3): two lineages, twelve finished projects, intended
 * outliers. Deterministic (seeded PRNG). SYNTHETIC ONLY — never mixed with real data.
 *
 * Each template item has a "true" log bias μ_k (how much longer it really takes than the template says); a
 * project's actual days are T × exp(μ_k + ε), ε ~ N(0, σ). Two leaves are input mistakes (× 4).
 */
import type { BaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { addDays } from "./dates"
import type { BacktestProject } from "./backtest"

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

interface TemplateSpec {
  lineage: string
  projectType: string
  schedule: BaseSchedule
  bias: Record<string, number>
}

export const SYNTHETIC_TEMPLATES: readonly TemplateSpec[] = [
  {
    lineage: "equipment-install",
    projectType: "equipment",
    schedule: {
      items: [
        { key: "spec", name: "仕様の確定", durationDays: 10 },
        { key: "rfq", name: "見積もり依頼", durationDays: 5, dependsOn: ["spec"] },
        { key: "order", name: "発注", durationDays: 3, dependsOn: ["rfq"] },
        { key: "deliver", name: "納入", durationDays: 20, dependsOn: ["order"], load: 0 },
        { key: "install", name: "据え付け", durationDays: 8, dependsOn: ["deliver"] },
        { key: "accept", name: "検収", milestone: true, dependsOn: ["install"] },
      ],
    },
    bias: { spec: Math.log(1.2), rfq: 0, order: 0, deliver: Math.log(1.4), install: Math.log(1.25) },
  },
  {
    lineage: "software-release",
    projectType: "software",
    schedule: {
      items: [
        { key: "req", name: "要件定義", durationDays: 5 },
        { key: "design", name: "設計", durationDays: 8, dependsOn: ["req"] },
        { key: "impl", name: "実装", durationDays: 15, dependsOn: ["design"] },
        { key: "test", name: "試験", durationDays: 6, dependsOn: ["impl"] },
        { key: "release", name: "リリース", milestone: true, dependsOn: ["test"] },
      ],
    },
    bias: { req: Math.log(1.3), design: Math.log(1.1), impl: Math.log(1.5), test: Math.log(1.2) },
  },
]

export interface SyntheticOptions {
  seed?: number
  projects?: number
  sigma?: number
}

export function syntheticPortfolio(options: SyntheticOptions = {}): BacktestProject[] {
  const rand = mulberry32(options.seed ?? 20261103)
  const count = options.projects ?? 12
  const sigma = options.sigma ?? 0.2
  const out: BacktestProject[] = []
  for (let i = 0; i < count; i++) {
    const spec = SYNTHETIC_TEMPLATES[i % SYNTHETIC_TEMPLATES.length]
    const month = i * 2
    const startDate = `${2024 + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}-06`
    const actualDays: Record<string, number> = {}
    let total = 0
    for (const item of spec.schedule.items) {
      if (item.milestone) continue
      const T = item.durationDays ?? 1
      const a = Math.max(1, Math.round(T * Math.exp((spec.bias[item.key] ?? 0) + sigma * normal(rand))))
      actualDays[item.key] = a
      total += a
    }
    // Intended outliers: an input mistake in project 4 (deliver) and project 9 (impl).
    if (i === 4) actualDays.deliver = (actualDays.deliver ?? 20) * 4
    if (i === 9) actualDays.impl = (actualDays.impl ?? 15) * 4
    const closedAt = addDays(startDate, total + 5, false)
    out.push({
      projectId: `syn-${String(i + 1).padStart(2, "0")}`,
      lineage: spec.lineage,
      projectType: spec.projectType,
      attributes: [],
      repoCount: spec.projectType === "software" ? 1 + (i % 3) : 0,
      startDate,
      closedAt,
      finalizedAt: addDays(closedAt, 7, false),
      schedule: spec.schedule,
      actualDays,
    })
  }
  return out
}

/**
 * Backtest of the estimate engine (plan 12 E2 / §5) on the SYNTHETIC portfolio (two lineages, twelve finished
 * projects, intended outliers). Prints the report as JSON. Reads no database and writes nothing.
 *
 *   node --import tsx scripts/plan-backtest.ts                 default seed
 *   node --import tsx scripts/plan-backtest.ts --seed 42       another synthetic portfolio
 *   node --import tsx scripts/plan-backtest.ts --summary       overall and per-stratum metrics only
 *
 * Real snapshots (E1) are not read yet; recording into plan_estimate_eval comes with E1.
 */
import { runBacktest } from "../src/lib/plan-estimate/backtest"
import { syntheticPortfolio } from "../src/lib/plan-estimate/synthetic"

function seedArg(): number | undefined {
  const i = process.argv.indexOf("--seed")
  if (i < 0) return undefined
  const raw = process.argv[i + 1]
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    console.error(`--seed needs an integer (got ${raw ?? "nothing"})`)
    process.exit(2)
  }
  const n = Number(raw)
  if (!Number.isSafeInteger(n)) {
    console.error(`--seed is out of range (got ${raw})`)
    process.exit(2)
  }
  return n
}

const seed = seedArg()
const report = runBacktest(syntheticPortfolio({ seed }))
const out = process.argv.includes("--summary") ? { methodVersion: report.methodVersion, overall: report.overall, byRepoCount: report.byRepoCount, byLineage: report.byLineage } : report
console.log(JSON.stringify(out, null, 2))

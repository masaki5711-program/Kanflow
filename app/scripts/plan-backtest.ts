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

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  const v = i >= 0 ? process.argv[i + 1] : undefined
  return v && !v.startsWith("--") ? v : undefined
}

const seedArg = argValue("--seed")
const seed = seedArg === undefined ? undefined : Number(seedArg)
if (seed !== undefined && !Number.isInteger(seed)) {
  console.error(`--seed must be an integer (got ${seedArg})`)
  process.exit(2)
}
const report = runBacktest(syntheticPortfolio({ seed }))
const out = process.argv.includes("--summary") ? { methodVersion: report.methodVersion, overall: report.overall, byRepoCount: report.byRepoCount, byLineage: report.byLineage } : report
console.log(JSON.stringify(out, null, 2))

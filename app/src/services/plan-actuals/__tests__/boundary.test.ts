import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * item_facts_only_via_learnable_item_facts (plan 12 §2.2, design review HIGH 5): the PBI-derived numbers of a
 * snapshot (plan_actuals_item_pbi / _repo) are read ONLY by learnableItemFacts, which re-checks confidentiality at
 * use time. The finalizer may write them. Any other file touching those tables would be a path around the check.
 */
const SRC = path.resolve(__dirname, "../../..")
const ALLOWED = new Set([
  path.join("services", "plan-actuals", "actuals.learnable.ts"),
  // Writes them (nested create) when finalizing; never reads them back.
  path.join("services", "plan-actuals", "actuals.service.ts"),
])
const TABLE = /\b(planActualsItemPbi|planActualsItemRepo|plan_actuals_item_pbi|plan_actuals_item_repo|PlanActualsItemPbi|PlanActualsItemRepo)\b/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "generated" || entry.name === "node_modules") continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

describe("snapshot PBI facts boundary", () => {
  it("item_facts_only_via_learnable_item_facts", () => {
    const offenders = walk(SRC)
      .filter((f) => TABLE.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f))
      .filter((rel) => !ALLOWED.has(rel))
    expect(offenders).toEqual([])
  })

  it("no other file reaches the PBI / repo rows through the item relation (include / select of pbis or repos)", () => {
    const relation = /planActualsItem[\s\S]{0,400}?\b(pbis|repos)\s*:\s*(true|\{)/
    const offenders = walk(SRC)
      .filter((f) => relation.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f))
      .filter((rel) => rel !== path.join("services", "plan-actuals", "actuals.learnable.ts"))
    expect(offenders).toEqual([])
  })

  it("the internal learning projection never reaches a route or a page (plan 12 §4)", () => {
    const appDir = path.join(SRC, "app")
    const offenders = walk(appDir)
      .filter((f) => /plan-actuals\/actuals\.learnable/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it("the finalizer only writes them (no read of the PBI / repo rows outside learnableItemFacts)", () => {
    const service = fs.readFileSync(path.join(SRC, "services", "plan-actuals", "actuals.service.ts"), "utf8")
    expect(service).not.toMatch(/planActualsItemPbi\.(find|count|aggregate|groupBy)|planActualsItemRepo\.(find|count|aggregate|groupBy)/)
    expect(service).not.toMatch(/include:\s*\{[^}]*\b(pbis|repos)\s*:/)
  })
})

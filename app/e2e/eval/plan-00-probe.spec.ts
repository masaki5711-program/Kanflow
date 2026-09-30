import { test } from "@playwright/test"
import { PROJECT, PROJECT2, SHOTS, getPlan, gotoPlan, report, userPage } from "./plan-support"

test("probe plan data + first look", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  for (const p of [PROJECT, PROJECT2]) {
    const plan = await getPlan(page, p)
    console.log(`PROJECT ${p} today=${plan.today} items=${plan.items.length} deps=${plan.dependencies.length}`)
    for (const i of plan.items) console.log(JSON.stringify({ id: i.id, n: i.name, p: i.parentId, s: i.plannedStart, e: i.plannedEnd, ms: i.isMilestone, st: i.status, pct: i.progressPct, mode: i.progressMode, ss: i.scheduleState, bl: i.baselineStart, linked: i.linked, owner: i.owner?.name }))
  }
  await gotoPlan(page)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/00-po-1440-initial.png`, fullPage: true })
  await gotoPlan(page, "", PROJECT2)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/00-po-1440-zeva.png`, fullPage: true })
  report("probe", issues)
  await ctx.close()
})

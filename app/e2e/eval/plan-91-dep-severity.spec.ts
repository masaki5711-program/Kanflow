import { expect, test } from "@playwright/test"
import { PROJECT, SHOTS, api, createItem, deleteItem, gotoPlan, stamp, userPage, type Item } from "./plan-support"

/** Dependency arrows: successor starting on the predecessor's end day → orange, earlier → red. */
test("dependency arrow colours by severity", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  const s = stamp()
  const items: Item[] = []
  try {
    const a = await createItem(page, { name: `E2E-SEV${s} 先行`, plannedStart: "2026-10-01", plannedEnd: "2026-10-05" })
    const same = await createItem(page, { name: `E2E-SEV${s} 同日開始`, plannedStart: "2026-10-05", plannedEnd: "2026-10-08" })
    const early = await createItem(page, { name: `E2E-SEV${s} 前に開始`, plannedStart: "2026-10-03", plannedEnd: "2026-10-07" })
    const ok = await createItem(page, { name: `E2E-SEV${s} 後に開始`, plannedStart: "2026-10-06", plannedEnd: "2026-10-09" })
    items.push(a, same, early, ok)
    const depIds: string[] = []
    for (const succ of [same, early, ok]) {
      const r = await api(page, "POST", `/api/projects/${PROJECT}/plan/dependencies`, { predecessorId: a.id, successorId: succ.id })
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
      depIds.push((r.body.data ?? r.body).id)
    }
    const arrowOf = (id: string) => page.locator(`[data-plan-arrow="${id}"]`).first()
    await gotoPlan(page, `?q=E2E-SEV${s}`)
    await expect(arrowOf(depIds[0])).toHaveAttribute("data-severity", "sameDay", { timeout: 60_000 })
    await expect(arrowOf(depIds[1])).toHaveAttribute("data-severity", "before")
    await expect(arrowOf(depIds[2])).not.toHaveAttribute("data-severity")
    await page.screenshot({ path: `${SHOTS}/plan-dep-severity.png`, fullPage: false })
  } finally {
    for (const i of items) await deleteItem(page, i.id).catch(() => undefined)
    await ctx.close()
  }
})

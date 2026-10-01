import { expect, test, type Page } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * Dependencies (PBI ↔ PBI and master-plan drag-to-link) — walkthrough on the
 * isolated eval env. Creates links, verifies the UI, and removes them again.
 */
const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
const PASSWORD = "E2e-Kanflow-2026!"

test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
test.setTimeout(240_000)

interface Pbi {
  id: string
  displayId: number
  initiative: string | null
  blockedBy?: { dependencyId: string; id: string }[]
}

async function backlog(page: Page) {
  const res = await page.request.get(`/api/projects/${PROJECT}/backlog`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { readyItems: Pbi[]; notReadyItems: Pbi[] }
}

test("PBI dependency: add in detail, chip + order warning on the card, move below", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  const before = await backlog(page)
  const [upper, lower] = before.readyItems
  expect(upper && lower).toBeTruthy()

  await page.goto(`/projects/${PROJECT}/backlog?pbi=${upper.displayId}`)
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("依存関係（作業の順番）")).toBeVisible({ timeout: 60_000 })
  await dialog.getByRole("button", { name: "先に終わらせる PBI を追加" }).click()
  const picker = page.getByRole("dialog", { name: "先に終わらせる PBI を選択" })
  await picker.getByRole("searchbox").fill(`#${lower.displayId}`)
  await picker.locator(`[data-pbi-pick="${lower.id}"]`).click()
  await expect(page.getByText("依存関係を追加しました")).toBeVisible()
  await expect(dialog.locator("[data-pbi-dependencies] li")).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/deps-pbi-detail.png` })

  // A self-cycle is refused in the picker before reaching the server.
  await page.goto(`/projects/${PROJECT}/backlog?pbi=${lower.displayId}`)
  await page.getByRole("dialog").getByRole("button", { name: "先に終わらせる PBI を追加" }).click()
  const picker2 = page.getByRole("dialog", { name: "先に終わらせる PBI を選択" })
  await picker2.getByRole("searchbox").fill(`#${upper.displayId}`)
  await expect(picker2.locator(`[data-pbi-pick="${upper.id}"]`)).toBeDisabled()
  await page.screenshot({ path: `${SHOTS}/deps-pbi-picker-cycle.png` })
  await picker2.getByRole("button", { name: "キャンセル" }).click()
  await page.keyboard.press("Escape")

  await page.goto(`/projects/${PROJECT}/backlog`)
  const upperCard = page.locator("li", { has: page.locator(`[data-pbi-waiting]`) }).first()
  await expect(upperCard.getByText(`#${lower.displayId} の完了待ち`)).toBeVisible({ timeout: 60_000 })
  await expect(upperCard.locator("[data-pbi-order-warning]")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/deps-backlog-card.png`, fullPage: false })

  await upperCard.getByRole("button", { name: `#${lower.displayId} の下へ移動` }).click()
  await expect(page.getByText(`#${lower.displayId} の下へ移動しました`)).toBeVisible()
  await expect(page.locator("[data-pbi-order-warning]")).toHaveCount(0, { timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/deps-backlog-after-move.png` })

  // Cleanup: remove the link and restore the original order.
  const after = await backlog(page)
  const moved = after.readyItems.find((i) => i.id === upper.id)
  for (const dep of moved?.blockedBy ?? []) {
    expect((await page.request.delete(`/api/projects/${PROJECT}/backlog/dependencies/${dep.dependencyId}`)).ok()).toBeTruthy()
  }
  const orderedIds = before.readyItems.map((i) => i.id)
  expect((await page.request.put(`/api/projects/${PROJECT}/backlog/reorder`, { data: { orderedIds } })).ok()).toBeTruthy()
})

test("plan: drag the connector onto another bar, chain highlight, click arrow to remove", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  const plan = await (await page.request.get(`/api/projects/${PROJECT}/plan`)).json()
  const leaves = (plan.items as { id: string; parentId: string | null; isMilestone: boolean }[]).filter(
    (i) => !plan.items.some((c: { parentId: string | null }) => c.parentId === i.id),
  )
  test.skip(leaves.length < 2, "project has fewer than two plan leaves")
  const depsBefore = (plan.dependencies as { id: string }[]).length

  await page.goto(`/projects/${PROJECT}/plan`)
  await expect(page.locator("[data-plan-bar]").first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator("[data-plan-link-help]")).toContainText("ドラッグ")
  // Fit the whole plan so every bar (and its connector) is on screen.
  await page.getByRole("button", { name: "全体を表示" }).click()
  await page.waitForTimeout(800)

  // Pick two visible rows whose items are not parent/child and not linked yet.
  const rows = page.locator("[data-plan-row]")
  const ids = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.planRow as string))
  const chart = (await page.locator("[data-plan-chart]").boundingBox())!
  const gridRight = (await page.locator("[data-plan-grid-cell]").first().boundingBox())!
  const timelineLeft = gridRight.x + gridRight.width
  const leafRows = ids.filter((id) => leaves.some((l) => l.id === id))
  // Source: a leaf whose connector ● sits inside the visible timeline.
  let src = ""
  for (const id of leafRows) {
    const b = await page.locator(`[data-plan-connector="${id}"]`).boundingBox()
    if (b && b.x > timelineLeft + 4 && b.x + b.width < chart.x + chart.width - 4) {
      src = id
      break
    }
  }
  expect(src).not.toBe("")
  const linked = new Set((plan.dependencies as { predecessorId: string; successorId: string }[]).filter((d) => d.predecessorId === src).map((d) => d.successorId))
  const dst = leafRows.filter((id) => id !== src && !linked.has(id)).at(-1) as string
  await page.locator(`[data-plan-row="${src}"]`).hover()
  const connector = page.locator(`[data-plan-connector="${src}"]`)
  await expect(connector).toHaveCSS("opacity", "1")
  await page.screenshot({ path: `${SHOTS}/deps-plan-connector.png` })

  const from = (await connector.boundingBox())!
  const dstRow = (await page.locator(`[data-plan-row="${dst}"]`).boundingBox())!
  // Drop anywhere on the target row's visible timeline (its bar may be off-screen).
  const to = { x: (timelineLeft + chart.x + chart.width) / 2, y: dstRow.y + dstRow.height / 2 }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await expect(page.locator("[data-plan-link-overlay]")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/deps-plan-dragging.png` })
  await page.mouse.up()
  await expect(page.getByText("依存関係を追加しました")).toBeVisible()
  await expect(page.locator("[data-plan-arrow]")).toHaveCount(depsBefore + 1, { timeout: 30_000 })

  // Selecting the source highlights its chain.
  await page.locator(`[data-plan-bar="${src}"]`).click()
  await expect(page.locator('[data-plan-arrow][data-chain="true"]').first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/deps-plan-chain.png` })

  // Click the new arrow → confirm → removed.
  const after = await (await page.request.get(`/api/projects/${PROJECT}/plan`)).json()
  const created = (after.dependencies as { id: string; predecessorId: string; successorId: string }[]).find(
    (d) => d.predecessorId === src && d.successorId === dst,
  )!
  const hit = page.locator(`[data-plan-arrow-hit="${created.id}"]`)
  // Click near the arrow head (the start sits under the source's connector ●).
  const point = await hit.evaluate((el) => {
    const path = el as SVGPathElement
    const p = path.getPointAtLength(path.getTotalLength() - 6)
    const m = path.getScreenCTM()!
    return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }
  })
  await page.mouse.click(point.x, point.y)
  const confirmDialog = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  await expect(confirmDialog.getByText("依存関係を削除しますか？")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/deps-plan-remove-confirm.png` })
  await confirmDialog.getByRole("button", { name: "削除" }).click()
  await expect(page.locator("[data-plan-arrow]")).toHaveCount(depsBefore, { timeout: 30_000 })
})

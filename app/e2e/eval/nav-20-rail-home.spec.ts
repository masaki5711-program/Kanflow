import { expect, test } from "@playwright/test"
import { loginViaUi } from "../support/login"

/** IceBox first in 実行, the icon-only sidebar rail, and the home greeting above the KPI cards. */
test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })

const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"

test("sidebar rail + IceBox first + greeting above cards", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", "E2e-Kanflow-2026!")
  await page.goto("/")
  const greeting = page.locator("#top-greeting")
  await expect(greeting).toBeVisible({ timeout: 60_000 })
  const kpis = page.locator("section[aria-labelledby=top-greeting] dl, [data-testid=kpi-hint]").first()
  if (await kpis.count()) {
    const g = (await greeting.boundingBox())!
    const k = (await kpis.boundingBox())!
    expect(g.y + g.height).toBeLessThanOrEqual(k.y + 1)
  }
  await page.screenshot({ path: `${SHOTS}/home-greeting-top.png`, clip: { x: 0, y: 0, width: 1440, height: 420 } })

  await page.goto("/projects/cmr8tnrzm0000m09lghm5jshr/backlog")
  const nav = page.getByRole("navigation", { name: "プロジェクトメニュー" }).first()
  await expect(nav.locator("[data-sidebar-group=execute]").getByRole("link").first()).toHaveAttribute("href", /\/icebox$/, { timeout: 60_000 })
  await page.screenshot({ path: `${SHOTS}/sidebar-full.png`, clip: { x: 0, y: 0, width: 480, height: 900 } })

  await page.getByRole("button", { name: "サイドバーをアイコンだけにする" }).click()
  const aside = page.locator("aside[data-sidebar-rail]")
  await expect(aside).toBeVisible()
  await page.waitForTimeout(300)
  expect((await aside.boundingBox())!.width).toBeLessThan(80)
  await nav.getByRole("link", { name: "計画" }).hover()
  await expect(page.getByRole("tooltip")).toContainText("計画")
  await page.screenshot({ path: `${SHOTS}/sidebar-rail.png`, clip: { x: 0, y: 0, width: 480, height: 900 } })

  await page.reload()
  await expect(page.locator("aside[data-sidebar-rail]")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("button", { name: "サイドバーを広げる" }).click()
  await expect(page.locator("aside[data-sidebar-rail]")).toHaveCount(0)
})

import { expect, test } from "@playwright/test"
import { loginViaUi } from "../support/login"

/** The project dashboard is pinned at the top of the sidebar, above 実行. */
test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })

test("dashboard is the first sidebar entry", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", "E2e-Kanflow-2026!")
  await page.goto("/projects/cmr8tnrzm0000m09lghm5jshr/backlog")
  const nav = page.getByRole("navigation", { name: "プロジェクトメニュー" }).first()
  const first = nav.getByRole("link").first()
  await expect(first).toHaveText(/ダッシュボード/, { timeout: 60_000 })
  await expect(nav.locator("[data-sidebar-group=plan]").getByRole("link", { name: /ダッシュボード/ })).toHaveCount(0)
  await page.screenshot({ path: "D:/APP/Kanflow-e2e/reports/shots/nav-dashboard-top.png", clip: { x: 0, y: 0, width: 480, height: 900 } })
})

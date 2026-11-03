import { expect, test, type APIResponse } from "@playwright/test"
import { WRITE_SKIP_REASON, e2ePassword, e2eUser, writeFlowsEnabled } from "../support/env"
import { loginViaUi } from "../support/login"

/**
 * 計画を作る (plan 12 E5, §8 item 5) through the real UI: a template → a proposal (no backtest for this lineage yet:
 * the template's days, said so) → load → the master plan has the items. WRITE flow — skipped unless E2E_ALLOW_WRITE=1
 * and E2E_USER / E2E_PASSWORD are set; synthetic data in a throw-away project, deleted afterwards. Test DB only.
 *
 * Screenshots (1440 px and 375 px) go to test-results/estimate-*.png for the design check.
 */
test.describe.configure({ mode: "serial" })
test.skip(!writeFlowsEnabled, WRITE_SKIP_REASON)

const RUN_ID = `${Date.now()}`
let projectId = ""

async function json<T>(res: APIResponse, expectedStatus: number[]): Promise<T> {
  expect(expectedStatus, `${res.url()} -> ${res.status()} ${await res.text()}`).toContain(res.status())
  return (await res.json()) as T
}

const nextMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "language", value: "ja", url: process.env.E2E_BASE_URL || "http://localhost:3001" }])
  await loginViaUi(page, e2eUser, e2ePassword)
})

test.afterAll(async ({ browser }) => {
  if (!projectId) return
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginViaUi(page, e2eUser, e2ePassword)
    await page.request.delete(`/api/projects/${projectId}`)
  } finally {
    await context.close()
  }
})

test("template → proposal → load into the master plan", async ({ page }) => {
  const project = await json<{ id: string }>(
    await page.request.post("/api/projects", { data: { name: `E2E estimate ${RUN_ID}`, description: "Created by Playwright E2E", projectType: "general" } }),
    [200, 201],
  )
  projectId = project.id
  const templates = await json<{ id: string; name: string; nodeCount: number }[]>(await page.request.get("/api/plan-templates"), [200])
  const template = templates.find((t) => t.nodeCount > 0) ?? templates[0]
  expect(template, "a built-in template exists").toBeTruthy()

  await page.goto(`/projects/${projectId}/plan/estimate`)
  await expect(page.getByRole("heading", { level: 1, name: "計画を作る" })).toBeVisible()
  await page.getByLabel(/テンプレート/).selectOption(template.id)
  await page.getByLabel(/開始日/).fill(nextMonday())
  await page.getByRole("button", { name: "案を作る" }).click()

  // The card: the lineage has no backtest yet, so the template's days are kept and the card says why.
  const card = page.getByRole("region", { name: "計画の案" })
  await expect(card).toBeVisible()
  await expect(page).toHaveURL(/\?run=/)
  await expect(card.getByText(/検証がまだありません/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "計画の案" })).toBeFocused()

  // The evidence opens in place.
  await card.getByRole("button", { name: "根拠" }).click()
  await expect(page.getByRole("region", { name: /作業ごとの根拠/ })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: "test-results/estimate-1440.png", fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.screenshot({ path: "test-results/estimate-375.png", fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await card.getByRole("button", { name: "この計画を読み込む" }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/plan$`))
  const tree = await json<{ items: unknown[] }>(await page.request.get(`/api/projects/${projectId}/plan`), [200]).catch(() => ({ items: [] }))
  const count = Array.isArray(tree) ? tree.length : (tree.items?.length ?? 0)
  expect(count, "the master plan has the loaded items").toBeGreaterThan(0)
})

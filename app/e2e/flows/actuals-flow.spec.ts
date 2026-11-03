import { expect, test, type APIResponse } from "@playwright/test"
import { WRITE_SKIP_REASON, e2ePassword, e2eUser, writeFlowsEnabled } from "../support/env"
import { loginViaUi } from "../support/login"

/**
 * 実績を確定 (plan 12 E1) through the real UI: a plan with actual dates (one leaf without an end → an item to check),
 * finalize with the issue acknowledged, see the record and its leaves. WRITE flow — skipped unless E2E_ALLOW_WRITE=1
 * and E2E_USER / E2E_PASSWORD are set; synthetic data in a throw-away project, deleted afterwards. Test DB only.
 *
 * Screenshots (1440 px and 375 px) go to test-results/actuals-*.png for the design check.
 */
test.describe.configure({ mode: "serial" })
test.skip(!writeFlowsEnabled, WRITE_SKIP_REASON)

const RUN_ID = `${Date.now()}`
let projectId = ""

async function json<T>(res: APIResponse, expectedStatus: number[]): Promise<T> {
  expect(expectedStatus, `${res.url()} -> ${res.status()} ${await res.text()}`).toContain(res.status())
  return (await res.json()) as T
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

test("finalize the actuals of a finished plan, issues acknowledged", async ({ page }) => {
  const project = await json<{ id: string }>(
    await page.request.post("/api/projects", { data: { name: `E2E actuals ${RUN_ID}`, description: "Created by Playwright E2E", projectType: "software" } }),
    [200, 201],
  )
  projectId = project.id
  const base = `/api/projects/${projectId}/plan`
  const spec = await json<{ id: string; version: number }>(await page.request.post(base, { data: { name: "仕様（合成）", plannedStart: "2026-11-02", plannedEnd: "2026-11-04" } }), [200, 201])
  const impl = await json<{ id: string; version: number }>(await page.request.post(base, { data: { name: "実装（合成）", plannedStart: "2026-11-05", plannedEnd: "2026-11-11" } }), [200, 201])
  await json(await page.request.patch(`${base}/${spec.id}`, { data: { actualStart: "2026-11-02", actualEnd: "2026-11-04", status: "done" } }), [200])
  // 実装 has no actual end: an item to check.
  await json(await page.request.patch(`${base}/${impl.id}`, { data: { actualStart: "2026-11-09" } }), [200])
  // Save the planned dates as the baseline (what the actuals are compared with).
  await json(await page.request.post(`${base}/baseline`, { data: {} }), [200])

  await page.goto(`/projects/${projectId}/plan/actuals`)
  await expect(page.getByText("実装（合成） — 実績の開始日か終了日が空です")).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: "test-results/actuals-1440-before.png", fullPage: true })

  await page.getByRole("button", { name: "実績を確定" }).click()
  const dialog = page.getByRole("alertdialog")
  // 実装's missing end, and the plan not being loaded from a template.
  await expect(dialog.getByText(/確かめてほしい項目が 2 件あります/)).toBeVisible()
  await dialog.getByRole("button", { name: "確定する" }).click()

  await expect(page.getByRole("button", { name: "確定し直す" })).toBeVisible()
  await expect(page.getByText("最新")).toBeVisible()
  await page.getByRole("button", { name: "項目を見る" }).click()
  await expect(page.getByRole("rowheader", { name: "仕様（合成）" })).toBeVisible()
  await page.screenshot({ path: "test-results/actuals-1440-finalized.png", fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.screenshot({ path: "test-results/actuals-375-finalized.png", fullPage: true })

  const res = await json<{ snapshots: { current: boolean; leafCount: number; completeCount: number }[] }>(await page.request.get(`${base}/actuals`), [200])
  expect(res.snapshots).toEqual([expect.objectContaining({ current: true, leafCount: 2, completeCount: 1 })])
})

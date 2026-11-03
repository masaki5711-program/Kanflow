import { expect, test, type APIResponse } from "@playwright/test"
import { WRITE_SKIP_REASON, e2ePassword, e2eUser, writeFlowsEnabled } from "../support/env"
import { loginViaUi } from "../support/login"

/**
 * 稼働量と負荷 (plan 12 E4) through the real UI: a project with a dated item owned by the creator, the load table,
 * and adding one's own capacity. WRITE flow — skipped unless E2E_ALLOW_WRITE=1 and E2E_USER / E2E_PASSWORD are set;
 * synthetic data in a throw-away project, deleted afterwards. Test DB only.
 *
 * Screenshots (1440 px and 375 px) go to test-results/capacity-*.png for the design check.
 */
test.describe.configure({ mode: "serial" })
test.skip(!writeFlowsEnabled, WRITE_SKIP_REASON)

const RUN_ID = `${Date.now()}`
let projectId = ""

async function json<T>(res: APIResponse, expectedStatus: number[]): Promise<T> {
  expect(expectedStatus, `${res.url()} -> ${res.status()} ${await res.text()}`).toContain(res.status())
  return (await res.json()) as T
}

const todayPlus = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
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

test("see the load and add one's own capacity", async ({ page }) => {
  const project = await json<{ id: string }>(
    await page.request.post("/api/projects", { data: { name: `E2E capacity ${RUN_ID}`, description: "Created by Playwright E2E", projectType: "software" } }),
    [200, 201],
  )
  projectId = project.id
  const me = await json<{ id: string }>(await page.request.get("/api/user/profile"), [200]).catch(() => ({ id: "" }))
  const item = await json<{ id: string }>(await page.request.post(`/api/projects/${projectId}/plan`, { data: { name: "作業（合成）", plannedStart: todayPlus(1), plannedEnd: todayPlus(10), ...(me.id ? { ownerId: me.id } : {}) } }), [200, 201])
  expect(item.id).toBeTruthy()

  await page.goto(`/projects/${projectId}/plan/capacity`)
  await expect(page.getByRole("heading", { name: "メンバーの負荷" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "このプロジェクトへの割り当て" })).toBeVisible()
  const own = page.getByRole("region", { name: "自分の稼働量" }).or(page.locator("section", { has: page.getByRole("heading", { name: "自分の稼働量" }) }))
  await own.getByLabel(/開始日/).fill(todayPlus(0))
  await own.getByLabel(/割合/).fill("80")
  await own.getByRole("button", { name: "追加" }).click()
  await expect(own.getByText("80%")).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: "test-results/capacity-1440.png", fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.screenshot({ path: "test-results/capacity-375.png", fullPage: true })
})

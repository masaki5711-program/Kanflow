import { expect, test, type APIResponse } from "@playwright/test"
import { WRITE_SKIP_REASON, e2ePassword, e2eUser, writeFlowsEnabled } from "../support/env"
import { loginViaUi } from "../support/login"

/**
 * 反省点の規則 (plan 12 E3) through the real UI: write a draft, confirm it with its numbers shown, see it move to
 * 確定済み. WRITE flow — skipped unless E2E_ALLOW_WRITE=1 and E2E_USER / E2E_PASSWORD are set; it creates a
 * throw-away project (synthetic data) and deletes it afterwards. Run ONLY against a separate test database.
 *
 * Screenshots (1440 px and 375 px) go to test-results/lesson-rules-*.png for the design check.
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

test("write a draft and confirm it one at a time with its numbers shown", async ({ page }) => {
  const project = await json<{ id: string }>(
    await page.request.post("/api/projects", { data: { name: `E2E rules ${RUN_ID}`, description: "Created by Playwright E2E", projectType: "software" } }),
    [200, 201],
  )
  projectId = project.id

  await page.goto(`/projects/${projectId}/plan/lesson-rules`)
  await page.getByRole("button", { name: "規則を書く" }).first().click()
  const editor = page.getByRole("dialog")
  await editor.getByLabel("この項目の後に").fill("accept")
  await editor.getByLabel("日数（1〜30）").fill("3")
  await expect(editor.getByText("「accept」の後に 3 日の余裕を入れる")).toBeVisible()
  await editor.getByLabel("引用する反省の文（任意）").fill("検収の前に余裕が無く、手戻りが出た（合成データ）")
  await editor.getByRole("button", { name: "下書きを保存" }).click()

  const heading = page.getByRole("heading", { name: "「accept」の後に 3 日の余裕を入れる" })
  await expect(heading).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: "test-results/lesson-rules-1440-draft.png", fullPage: true })

  await page.getByRole("button", { name: "確定", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByText(/「accept」の後に 3 日の余裕を入れる/)).toBeVisible()
  await dialog.getByRole("button", { name: "この内容で確定する" }).click()

  await expect(page.getByRole("heading", { level: 2, name: /確定済み/ })).toBeVisible()
  await expect(page.getByRole("button", { name: "共有を申請" })).toBeVisible()
  await page.screenshot({ path: "test-results/lesson-rules-1440-confirmed.png", fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.screenshot({ path: "test-results/lesson-rules-375-confirmed.png", fullPage: true })

  const rules = await json<{ rules: { state: string; params: unknown }[] }>(await page.request.get(`/api/projects/${projectId}/plan/lesson-rules`), [200])
  expect(rules.rules).toEqual([expect.objectContaining({ state: "confirmed", params: { afterKey: "accept", days: 3 } })])
})

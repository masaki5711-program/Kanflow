import { expect, test, type Browser } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * "What's new": the SM mentions the PO in a sprint-task comment; the PO sees it
 * on the top page (unread messages + card badge), in the sidebar badge and in
 * the dashboard panel, and "mark all as seen" clears it.
 */
const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
const PASSWORD = "E2e-Kanflow-2026!"

test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
test.setTimeout(240_000)

async function mentionPoAsSm(browser: Browser, text: string) {
  const ctx = await browser.newContext({ locale: "ja-JP" })
  const page = await ctx.newPage()
  await loginViaUi(page, "e2e-sm@example.test", PASSWORD)
  const members = (await (await page.request.get(`/api/projects/${PROJECT}/members`)).json()) as { user: { name: string; email?: string } }[]
  const po = members.find((m) => m.user.email === "e2e-po@example.test") ?? members.find((m) => /po/i.test(m.user.name))
  expect(po).toBeTruthy()
  // Any sprint task (an object with a taskName) found in the sprint responses.
  const findTask = (v: unknown): { id: string } | null => {
    if (Array.isArray(v)) return v.map(findTask).find(Boolean) ?? null
    if (!v || typeof v !== "object") return null
    const o = v as Record<string, unknown>
    if (typeof o.taskName === "string" && typeof o.id === "string" && !o.isPlaceholder) return { id: o.id }
    return Object.values(o).map(findTask).find(Boolean) ?? null
  }
  let task = findTask(await (await page.request.get(`/api/projects/${PROJECT}/sprints`)).json())
  if (!task) {
    const raw = (await (await page.request.get(`/api/projects/${PROJECT}/sprints`)).json()) as unknown
    const ids = JSON.stringify(raw).match(/"id":"(c[a-z0-9]{20,})"/g)?.map((m) => m.slice(6, -1)) ?? []
    for (const id of ids) {
      const res = await page.request.get(`/api/projects/${PROJECT}/sprints/${id}`)
      if (res.ok() && (task = findTask(await res.json()))) break
    }
  }
  expect(task).toBeTruthy()
  const res = await page.request.post(`/api/projects/${PROJECT}/comments`, {
    data: { entityType: "sprint_task", entityId: task!.id, body: `@[${po!.user.name}] ${text}` },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  await ctx.close()
}

test("mention from a sprint shows on the top page, sidebar and dashboard; mark all as seen clears it", async ({ page, browser }) => {
  const text = `E2E 確認お願いします ${Date.now()}`
  await mentionPoAsSm(browser, text)

  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  await page.goto("/")
  const messages = page.locator("[data-home-messages]")
  await expect(messages).toBeVisible({ timeout: 60_000 })
  await expect(messages.locator("[data-notification-excerpt]").first()).toContainText("E2E 確認お願いします")
  await expect(page.locator(`[data-project-updates="${PROJECT}"]`).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/updates-home.png` })

  await page.goto(`/projects/${PROJECT}`)
  const panel = page.locator('[data-whats-new="list"]')
  await expect(panel).toBeVisible({ timeout: 60_000 })
  await expect(panel.locator("[data-notification-excerpt]").first()).toContainText("E2E 確認お願いします")
  await expect(page.locator(`a[href="/projects/${PROJECT}"] [data-sidebar-badge]`).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/updates-dashboard.png` })

  await panel.getByRole("button", { name: "すべて確認済みにする" }).click()
  await expect(page.getByText("確認済みにしました")).toBeVisible()
  await expect(page.locator('[data-whats-new="empty"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(`a[href="/projects/${PROJECT}"] [data-sidebar-badge]`)).toHaveCount(0, { timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/updates-dashboard-seen.png` })
})

import { expect, test, type Browser, type Page } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * Read state follows the notification everywhere: a mention on a sprint task
 * shows a red mark on the task's comment button; opening the thread clears
 * it; a mention read from the top page also clears the sprint mark. Chat
 * images open full screen in the app.
 */
const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
const PASSWORD = "E2e-Kanflow-2026!"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
test.setTimeout(300_000)

function findTask(v: unknown): { id: string; sprintId?: string } | null {
  if (Array.isArray(v)) return v.map(findTask).find(Boolean) ?? null
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  if (typeof o.taskName === "string" && typeof o.id === "string" && !o.isPlaceholder) return { id: o.id, sprintId: typeof o.sprintId === "string" ? o.sprintId : undefined }
  return Object.values(o).map(findTask).find(Boolean) ?? null
}

async function smMentionsPo(browser: Browser, taskId: string, text: string) {
  const ctx = await browser.newContext({ locale: "ja-JP" })
  const page = await ctx.newPage()
  await loginViaUi(page, "e2e-sm@example.test", PASSWORD)
  const members = (await (await page.request.get(`/api/projects/${PROJECT}/members`)).json()) as { user: { name: string; email?: string } }[]
  const po = members.find((m) => m.user.email === "e2e-po@example.test")!.user.name
  const res = await page.request.post(`/api/projects/${PROJECT}/comments`, { data: { entityType: "sprint_task", entityId: taskId, body: `@[${po}] ${text}` } })
  expect(res.ok(), await res.text()).toBeTruthy()
  await ctx.close()
}

async function activeTask(page: Page) {
  const list = await (await page.request.get(`/api/projects/${PROJECT}/sprints`)).json()
  let task = findTask(list)
  if (!task) {
    const ids = JSON.stringify(list).match(/"id":"(c[a-z0-9]{20,})"/g)?.map((m) => m.slice(6, -1)) ?? []
    for (const id of ids) {
      const r = await page.request.get(`/api/projects/${PROJECT}/sprints/${id}`)
      if (r.ok() && (task = findTask(await r.json()))) break
    }
  }
  expect(task).toBeTruthy()
  return task!
}

test("sprint comment unread mark: cleared by opening the thread, and by reading on the top page", async ({ page, browser }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  // Start clean: everything read.
  await page.request.post("/api/notifications/read-all")
  const task = await activeTask(page)

  await smMentionsPo(browser, task.id, `E2E 既読テスト1 ${Date.now()}`)
  const counts = async () =>
    (await (await page.request.get(`/api/projects/${PROJECT}/comments/counts?entityType=sprint_task&ids=${task.id}`)).json()) as { unread: Record<string, number> }
  expect((await counts()).unread[task.id]).toBeGreaterThan(0)

  await page.goto(`/projects/${PROJECT}/sprints?task=${task.id}`)
  const mark = page.locator("[data-comment-unread]").first()
  await expect(mark).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: `${SHOTS}/read-sync-sprint-unread.png` })

  // Open the thread from the deep link → read.
  await page.goto(`/projects/${PROJECT}/sprints?task=${task.id}&tab=comments`)
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 60_000 })
  await expect.poll(async () => (await counts()).unread[task.id] ?? 0, { timeout: 20_000 }).toBe(0)
  await page.keyboard.press("Escape")
  await expect(page.locator(`[data-comment-unread]`)).toHaveCount(0, { timeout: 20_000 })

  // Second mention, read on the top page → the sprint mark is gone too.
  await smMentionsPo(browser, task.id, `E2E 既読テスト2 ${Date.now()}`)
  await page.goto("/")
  const msg = page.locator("[data-home-messages] [data-testid=notification-row]").first()
  await expect(msg).toBeVisible({ timeout: 60_000 })
  await msg.getByRole("button").click()
  await expect.poll(async () => (await counts()).unread[task.id] ?? 0, { timeout: 20_000 }).toBe(0)
  await page.goto(`/projects/${PROJECT}/sprints`)
  await page.waitForLoadState("networkidle")
  await expect(page.locator("[data-comment-unread]")).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/read-sync-sprint-read.png` })
})

test("team chat: images open full screen; messages carry translations", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  await page.goto(`/projects/${PROJECT}/talk`)
  const composer = page.locator("[data-talk-composer]")
  await expect(composer).toBeVisible({ timeout: 60_000 })
  const text = `E2E 画像 ${Date.now()}`
  await composer.locator("input[type=file]").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG })
  await composer.getByRole("textbox").fill(text)
  await composer.getByRole("button", { name: "送信" }).click()
  const msg = page.locator("[data-talk-message]", { hasText: text })
  await expect(msg).toBeVisible({ timeout: 30_000 })
  await msg.locator("[data-talk-image]").click()
  // Full-screen viewer inside the app (no new tab).
  await expect(page.getByRole("dialog")).toBeVisible()
  expect(page.context().pages()).toHaveLength(1)
  await page.screenshot({ path: `${SHOTS}/talk-image-fullscreen.png` })
  await page.keyboard.press("Escape")

  // The new message is queued for translation (JA → ID) and the DTO carries the i18n block.
  const list = (await (await page.request.get(`/api/projects/${PROJECT}/talk/messages`)).json()) as { items: { body: string; i18n?: Record<string, unknown>; translation?: { type: string } }[] }
  const mine = list.items.find((m) => m.body === text)!
  expect(mine.translation?.type).toBe("team_message")
  expect(mine.i18n).toBeDefined()
})

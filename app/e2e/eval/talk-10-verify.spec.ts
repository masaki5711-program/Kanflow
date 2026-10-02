import { expect, test, type Page } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * Team chat: sprint comments appear (mirrors), a message with @mention and
 * files, oversized files refused, a reply to a sprint comment is also posted
 * to that comment thread, and the mentioned member sees the highlight + badge.
 */
const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
const PASSWORD = "E2e-Kanflow-2026!"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
test.setTimeout(300_000)

async function smName(page: Page): Promise<string> {
  const members = (await (await page.request.get(`/api/projects/${PROJECT}/members`)).json()) as { user: { name: string; email?: string } }[]
  return (members.find((m) => m.user.email === "e2e-sm@example.test") ?? members.find((m) => /SM/.test(m.user.name)))!.user.name
}

test("team chat: mirrors, mention + files, size limit, reply goes to the sprint thread, mentioned user sees it", async ({ page, browser }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  await page.goto(`/projects/${PROJECT}/talk`)
  const list = page.locator("[data-talk-list]")
  await expect(list.locator("[data-talk-message]").first()).toBeVisible({ timeout: 60_000 })
  // Comments written on sprint tasks show here with their source.
  await expect(list.getByText(/タスク「.+」 のコメント/).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/talk-initial.png` })

  // Oversized file is refused before upload.
  const composer = page.locator("[data-talk-composer]")
  await composer.locator("input[type=file]").setInputFiles({ name: "huge.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(21 * 1024 * 1024) })
  await expect(page.getByText(/「huge.bin」は大きすぎます/)).toBeVisible()
  await expect(composer.getByText("huge.bin")).toHaveCount(0)

  // Message with a mention and two files.
  const sm = await smName(page)
  const text = `E2E チャット ${Date.now()}`
  await composer.locator("input[type=file]").setInputFiles([
    { name: "shot.png", mimeType: "image/png", buffer: PNG },
    { name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("memo") },
  ])
  const box = composer.getByRole("textbox")
  await box.fill(`@[${sm}] ${text}`)
  await composer.getByRole("button", { name: "送信" }).click()
  const mine = list.locator("[data-talk-message]", { hasText: text })
  await expect(mine).toBeVisible({ timeout: 30_000 })
  await expect(mine.locator("img")).toHaveCount(1)
  await expect(mine.getByText("memo.txt")).toBeVisible()

  // Reply to a mirrored sprint comment → also posted to that task's comment thread.
  const mirrored = list.locator("[data-talk-message]", { has: page.getByText(/タスク「.+」 のコメント/) }).first()
  await mirrored.hover()
  await mirrored.getByRole("button", { name: /^返信/ }).click()
  await expect(composer.getByText(/のコメントにも書き込まれます/)).toBeVisible()
  const reply = `E2E 返信 ${Date.now()}`
  await box.fill(reply)
  await composer.getByRole("button", { name: "送信" }).click()
  const replied = list.locator("[data-talk-message]", { hasText: reply })
  await expect(replied).toBeVisible({ timeout: 30_000 })
  await expect(replied.locator("[data-talk-quote]")).toBeVisible()
  await expect(replied.getByText(/のコメントにも投稿済み/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/talk-after-send.png` })

  const href = await replied.getByRole("link", { name: /のコメントにも投稿済み/ }).getAttribute("href")
  const taskId = new URL(href!, "http://x").searchParams.get("task")
  const thread = (await (await page.request.get(`/api/projects/${PROJECT}/comments?entityType=sprint_task&entityId=${taskId}&limit=100`)).json()) as { items: { body: string | null }[] }
  expect(thread.items.some((c) => c.body?.includes(reply))).toBe(true)

  // The mentioned SM: red @ badge in the sidebar, highlighted message.
  const ctx = await browser.newContext({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
  const smPage = await ctx.newPage()
  await loginViaUi(smPage, "e2e-sm@example.test", PASSWORD)
  await smPage.goto(`/projects/${PROJECT}/backlog`)
  await expect(smPage.locator('[data-sidebar-badge][data-tone="alert"]')).toBeVisible({ timeout: 60_000 })
  await smPage.screenshot({ path: `${SHOTS}/talk-sm-sidebar.png`, clip: { x: 0, y: 0, width: 480, height: 300 } })
  await smPage.goto(`/projects/${PROJECT}/talk`)
  const forMe = smPage.locator('[data-talk-message][data-for-me="true"]', { hasText: text })
  await expect(forMe).toBeVisible({ timeout: 60_000 })
  await smPage.screenshot({ path: `${SHOTS}/talk-sm-view.png` })
  await smPage.getByRole("button", { name: "あなた宛て" }).click()
  await expect(smPage.locator("[data-talk-message]", { hasText: text })).toBeVisible()
  await ctx.close()
})

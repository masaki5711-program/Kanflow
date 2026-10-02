import { expect, test } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * Dashboard attachments: add a GitLab link (name auto-filled from the URL),
 * open it, edit, delete. IceBox: create a request with an image and a file
 * attached in the create form (picker + pasted screenshot).
 */
const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
const PASSWORD = "E2e-Kanflow-2026!"
// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
test.setTimeout(240_000)

test("dashboard: add a GitLab link, it opens the URL, edit and delete it", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  await page.goto(`/projects/${PROJECT}`)
  await page.getByRole("button", { name: "リンクを追加" }).click()
  const dialog = page.getByRole("dialog", { name: /リンクを追加/ })
  await dialog.getByLabel("URL").fill("javascript:alert(1)")
  await expect(dialog.getByRole("button", { name: "保存" })).toBeDisabled()
  await dialog.getByLabel("URL").fill("https://gitlab.example.com/iot-platform/edge-gateway/-/tree/main")
  await expect(dialog.getByLabel(/表示名/)).toHaveValue("iot-platform/edge-gateway")
  await page.screenshot({ path: `${SHOTS}/links-dialog.png` })
  await dialog.getByRole("button", { name: "保存" }).click()
  await expect(page.getByText("リンクを追加しました")).toBeVisible()

  const link = page.locator("a[data-attachment-link]", { hasText: "iot-platform/edge-gateway" }).first()
  await expect(link).toHaveAttribute("href", "https://gitlab.example.com/iot-platform/edge-gateway/-/tree/main")
  await expect(link).toHaveAttribute("target", "_blank")
  await link.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/links-row.png` })

  // Edit the name
  const row = page.locator("li", { has: link })
  await row.hover()
  await row.getByRole("button", { name: /リンクを編集/ }).click()
  const edit = page.getByRole("dialog", { name: "リンクを編集" })
  await edit.getByLabel(/表示名/).fill("Edge Gateway")
  await edit.getByRole("button", { name: "保存" }).click()
  await expect(page.getByText("リンクを更新しました")).toBeVisible()
  const renamed = page.locator("a[data-attachment-link]", { hasText: "Edge Gateway" }).first()
  await expect(renamed).toBeVisible()

  // The attachment API redirects a link entry to its URL
  const id = await renamed.getAttribute("data-attachment-link")
  const res = await page.request.get(`/api/projects/${PROJECT}/attachments/${id}`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()["location"]).toBe("https://gitlab.example.com/iot-platform/edge-gateway/-/tree/main")

  // Delete (cleanup)
  await page.locator("li", { has: renamed }).hover()
  await page.locator("li", { has: renamed }).getByRole("button", { name: /削除: Edge Gateway/ }).click()
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: "削除" }).click()
  await expect(page.locator("a[data-attachment-link]", { hasText: "Edge Gateway" })).toHaveCount(0)
})

test("icebox: create a request with an image and a document attached", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  await page.goto(`/projects/${PROJECT}/icebox`)
  await page.getByRole("button", { name: /新しい要望|要望を追加|追加/ }).first().click()
  const form = page.locator("section[aria-labelledby=icebox-new-request]")
  const text = `E2E 添付つき要望 ${Date.now()}`
  await form.getByRole("textbox").nth(1).fill(text)

  await form.locator("[data-icebox-file-picker] input[type=file]").setInputFiles([
    { name: "sketch.png", mimeType: "image/png", buffer: PNG },
    { name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
  ])
  // Paste a screenshot into the request text area
  await form.getByRole("textbox").nth(1).evaluate((el, b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bin], "image.png", { type: "image/png" }))
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  }, PNG.toString("base64"))
  await expect(form.locator("[data-icebox-file-picker] li")).toHaveCount(3)
  await expect(form.getByText(/screenshot-\d{8}-\d{6}\.png/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/icebox-create-files.png` })

  await form.getByRole("button", { name: /^追加|アップロード中/ }).click()
  await expect(form).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 60_000 })
  const items = (await (await page.request.get(`/api/projects/${PROJECT}/icebox`)).json()) as Record<string, unknown>
  const all = JSON.stringify(items)
  expect(all).toContain(text)
  const created = (Object.values(items).flat() as { request?: string; attachments?: unknown[] }[]).find((i) => i?.request === text)
  expect(created?.attachments?.length).toBe(3)
  await page.screenshot({ path: `${SHOTS}/icebox-created-with-files.png` })
})

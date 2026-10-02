import { expect, test, type Page } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, PROJECT, SHOTS, stamp } from "./backlog-support"

/** PBI 参考資料: auto-growing box, drop + paste of files/images in edit mode, read view thumbnails. */
test.use({ viewport: { width: 1440, height: 1000 } })

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

async function dispatchFiles(page: Page, selector: string, type: "drop" | "paste") {
  await page.evaluate(
    ({ selector, type, png }) => {
      const el = document.querySelector(selector) as HTMLElement
      const dt = new DataTransfer()
      const bin = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
      dt.items.add(new File([bin], type === "drop" ? "dropped.png" : "pasted.png", { type: "image/png" }))
      dt.items.add(new File(["hello"], `${type}-notes.txt`, { type: "text/plain" }))
      if (type === "drop") {
        el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }))
        el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }))
      } else {
        el.focus()
        el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }))
      }
    },
    { selector, type, png: PNG_1PX },
  )
}

test("参考資料: grow, drop, paste, read view", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-REF-${stamp()}`
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として参考資料を確認したい。", workloadScore: 1 })
  expect(r.status).toBe(201)
  const pbi = (r.body.data ?? r.body) as { id: string }
  await page.goto(`${BACKLOG}?q=${tag}`)
  await page.getByRole("button", { name: tag }).click()
  const dlg = page.getByRole("dialog", { name: tag })
  await dlg.getByRole("button", { name: "編集" }).click()

  const ref = dlg.getByRole("textbox", { name: "参考資料" })
  const h0 = (await ref.boundingBox())!.height
  await ref.fill(Array.from({ length: 25 }, (_, i) => `行 ${i + 1}`).join("\n"))
  const h1 = (await ref.boundingBox())!.height
  console.log("ref height", h0, "->", h1)
  expect(h1).toBeGreaterThan(h0 + 100)

  await ref.evaluate((el) => el.setAttribute("data-e2e-ref", ""))
  await dispatchFiles(page, "[data-e2e-ref]", "paste")
  await expect(dlg.getByText("paste-notes.txt")).toBeVisible({ timeout: 30_000 })
  const group = dlg.getByRole("group", { name: /参考資料の添付/ })
  await group.evaluate((el) => el.setAttribute("data-e2e-drop", ""))
  await dispatchFiles(page, "[data-e2e-drop]", "drop")
  await expect(dlg.getByText("drop-notes.txt")).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/pbi-ref-edit.png` })

  const detail = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  const atts = ((detail.body.data ?? detail.body) as { attachments?: Array<{ originalName: string }> }).attachments ?? []
  console.log("stored", atts.map((a) => a.originalName))
  expect(atts.map((a) => a.originalName).sort()).toEqual(["drop-notes.txt", "dropped.png", "paste-notes.txt", "pasted.png"])

  await dlg.getByRole("button", { name: "更新" }).click()
  await expect(dlg.getByRole("button", { name: "編集" })).toBeVisible()
  await expect(dlg.getByRole("button", { name: /pasted\.png をプレビュー/ })).toBeVisible()
  await dlg.getByRole("button", { name: /pasted\.png をプレビュー/ }).click()
  await page.screenshot({ path: `${SHOTS}/pbi-ref-preview.png` })
})

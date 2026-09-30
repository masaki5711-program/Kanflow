/** Platform eval (cycle 1): server error text shown in the UI for a non-Japanese user (upload mismatch). */
import { test, expect } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"
import { apiLogin, BASE, DATA, PILOT, shot } from "./platform-helpers"

test("upload mismatch toast for an Indonesian-language user", async ({ browser }) => {
  const email = fs.readFileSync(`${DATA}/platform-ui-user.txt`, "utf8").split(" ")[0]
  const api = await apiLogin(email)
  await api.patch("/api/user/language", { data: { language: "id" } })
  const ctx = await browser.newContext({ baseURL: BASE, storageState: await api.storageState() })
  const page = await ctx.newPage()
  await page.goto(`/projects/${PILOT}`)
  const section = page.locator("section[aria-labelledby='dashboard-attachments-heading']").first()
  await expect(section).toBeVisible({ timeout: 30_000 })
  await section.locator("input[type=file]").first().setInputFiles(path.join(__dirname, "fixtures-platform", "fake-image.png"))
  await page.waitForTimeout(2500)
  const toasts = (await page.locator("[role=alert],[role=status]").allTextContents()).filter(Boolean).join(" | ")
  fs.appendFileSync(`${DATA}/platform-uploads.log`, `UI mismatch toast (id user): ${toasts}\n`)
  await page.screenshot({ path: shot("upload-mismatch-toast-id-user") })
  expect(toasts).not.toMatch(/[぀-ヿ]/)
})

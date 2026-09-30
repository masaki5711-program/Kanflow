/**
 * Platform eval (cycle 1): upload hardening (magic bytes, active content, zip bombs).
 */
import { test, expect } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"
import { apiFor, contextFor, DATA, note, PILOT, shot } from "./platform-helpers"

const FX = path.join(__dirname, "fixtures-platform")
const fx = (n: string) => path.join(FX, n)
const log: string[] = []
test.setTimeout(180_000)

function filePart(name: string) {
  return { name, mimeType: "application/octet-stream", buffer: fs.readFileSync(fx(name)) }
}

test("API: attachment type checks + safe serving", async () => {
  const po = await apiFor("po")
  const cases: Array<[string, number]> = [
    ["fake-image.png", 415],
    ["exe-as.pdf", 415],
    ["normal.txt", 201],
    ["script.svg", 201],
    ["page.html", 201],
  ]
  const created: string[] = []
  for (const [name, want] of cases) {
    const r = await po.post(`/api/projects/${PILOT}/attachments`, { multipart: { file: filePart(name) } })
    const body = await r.json()
    log.push(`upload ${name} -> ${r.status()} ${JSON.stringify(body).slice(0, 140)}`)
    expect.soft(r.status(), name).toBe(want)
    if (r.status() === 201) {
      created.push(body.id)
      const g = await po.get(`/api/projects/${PILOT}/attachments/${body.id}`)
      const h = g.headers()
      log.push(`  serve ${name}: ${h["content-type"]} | ${h["content-disposition"]} | nosniff=${h["x-content-type-options"]}`)
      if (name !== "normal.txt") {
        expect(h["content-type"]).toBe("application/octet-stream")
        expect(h["content-disposition"]).toMatch(/^attachment/)
      }
    }
  }
  for (const id of created) log.push(`  cleanup ${id} -> ${(await po.delete(`/api/projects/${PILOT}/attachments/${id}`)).status()}`)
})

test("API: Excel import guards", async () => {
  const po = await apiFor("po")
  for (const [name, want] of [
    ["text-as.xlsx", 415],
    ["declared-huge.xlsx", 413],
    ["ratio-bomb.xlsx", 413],
    ["lying-bomb.xlsx", 413], // S-3: the capped inflate catches the lying sizes before exceljs
  ] as const) {
    const t0 = Date.now()
    const r = await po.post(`/api/projects/${PILOT}/backlog/import?dryRun=1`, { multipart: { file: filePart(name) } })
    log.push(`import ${name} -> ${r.status()} in ${Date.now() - t0} ms ${(await r.text()).slice(0, 160)}`)
    expect.soft(r.status(), name).toBe(want)
  }
  const health = await po.get("/api/health")
  expect(health.status()).toBe(200)
})

test("UI: mismatching attachment rejected, normal upload works (dev, id)", async ({ browser }) => {
  const ctx = await contextFor(browser, "dev")
  const page = await ctx.newPage()
  await page.goto(`/projects/${PILOT}`)
  const sections = page.locator("section[aria-labelledby='dashboard-attachments-heading']")
  await expect(sections.first()).toBeVisible({ timeout: 30_000 })
  log.push(`attachments sections in DOM: ${await sections.count()}; ids 'dashboard-attachments-heading': ${await page.locator("#dashboard-attachments-heading").count()}`)
  const section = sections.filter({ visible: true }).first()
  const input = section.locator("input[type=file]").first()
  await input.setInputFiles(fx("fake-image.png"))
  const toast = page.locator("[role=alert], [role=status]").filter({ hasText: /./ }).last()
  await expect(toast).toBeVisible({ timeout: 15_000 })
  const msg = (await page.locator("[role=alert], [role=status]").allTextContents()).join(" | ")
  log.push(`UI mismatch toast (id user): ${msg}`)
  await page.screenshot({ path: shot("upload-mismatch-toast-id") })

  const upload = page.waitForResponse((r) => r.url().endsWith("/attachments") && r.request().method() === "POST")
  await input.setInputFiles(fx("normal.txt"))
  const res = await upload
  expect(res.status()).toBe(201)
  const id = (await res.json()).id
  await expect(section.getByText("normal.txt").first()).toBeVisible()
  await page.screenshot({ path: shot("upload-normal-ok") })
  const api = await apiFor("dev")
  log.push(`UI normal upload cleanup -> ${(await api.delete(`/api/projects/${PILOT}/attachments/${id}`)).status()}`)
  await ctx.close()
})

test("UI: Excel import dialog rejects zip bomb (po, ja)", async ({ browser }) => {
  const ctx = await contextFor(browser, "po")
  const page = await ctx.newPage()
  await page.goto(`/projects/${PILOT}/backlog`)
  const opener = page.getByRole("button", { name: /Excel 取込|Import from Excel|Impor dari Excel/ })
  await expect(opener.first()).toBeVisible({ timeout: 30_000 })
  await opener.first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.locator("input[type=file]").setInputFiles(fx("declared-huge.xlsx"))
  await dialog.getByRole("button", { name: /内容を確認|Check file|Periksa/ }).click()
  await page.waitForTimeout(2000)
  const txt = (await dialog.textContent()) ?? ""
  const toasts = (await page.locator("[role=alert]").allTextContents()).join(" | ")
  log.push(`UI import zip-bomb: dialog="${txt.slice(0, 300)}" toasts="${toasts}"`)
  await page.screenshot({ path: shot("import-zipbomb-rejected") })
  expect(txt + toasts).toMatch(/上限|大き|サイズ|size|形式/)
  await ctx.close()
})

test.afterAll(() => {
  fs.writeFileSync(`${DATA}/platform-uploads.log`, log.join("\n"))
  note({ kind: "uploads", log })
})

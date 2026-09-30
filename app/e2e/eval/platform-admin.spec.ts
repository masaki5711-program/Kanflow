/**
 * Platform eval (cycle 1): admin metrics page, admin project trash restore / purge, /api/health.
 */
import { test, expect } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, contextFor, DATA, note, shot } from "./platform-helpers"

const log: string[] = []
test.setTimeout(180_000)

test("admin metrics renders numbers + charts and refreshes", async ({ browser }) => {
  const ctx = await contextFor(browser, "admin")
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/admin/metrics")
  const kpis = page.locator("dl").first()
  await expect(kpis).toBeVisible({ timeout: 30_000 })
  const dd = await kpis.locator("dd").allTextContents()
  log.push(`metrics KPI values: ${dd.join(" | ")}`)
  expect(dd.some((v) => /\d/.test(v))).toBe(true)
  const charts = page.locator("[role=img]")
  await expect(charts.first()).toBeVisible()
  const svgCount = await page.locator("[role=img] svg").count()
  log.push(`metrics charts: ${await charts.count()} role=img, ${svgCount} svg`)
  await page.screenshot({ path: shot("admin-metrics"), fullPage: true })
  const refetch = page.waitForResponse((r) => r.url().includes("/api/admin/metrics"), { timeout: 15_000 })
  await page.getByRole("button", { name: /再読み込み|Refresh|Muat ulang/ }).click()
  const res = await refetch
  log.push(`metrics refresh -> ${res.status()}`)
  expect(res.status()).toBe(200)
  const routesTable = page.locator("section[aria-labelledby='metrics-routes'] tr")
  log.push(`metrics route rows: ${await routesTable.count()}`)
  log.push(`metrics page errors: ${errors.join(" / ") || "none"}`)
  expect(errors).toEqual([])
  await ctx.close()
})

test("admin project trash: restore and purge a throwaway project", async ({ browser }) => {
  const po = await apiFor("po")
  const name = `PLAT-TRASH-${Date.now()}`
  const created = await po.post("/api/projects", { data: { name, description: "platform eval throwaway" } })
  expect(created.status()).toBe(201)
  const pj = await created.json()
  const id: string = pj.id ?? pj.data?.id
  const del = await po.delete(`/api/projects/${id}`)
  log.push(`po deletes project -> ${del.status()}`)
  expect([200, 204]).toContain(del.status())
  const admin = await apiFor("admin")
  log.push(`trashed project GET as admin -> ${(await admin.get(`/api/projects/${id}`)).status()}, as po -> ${(await po.get(`/api/projects/${id}`)).status()}`)
  expect((await admin.get(`/api/projects/${id}`)).status()).toBe(404)

  const ctx = await contextFor(browser, "admin")
  const page = await ctx.newPage()
  await page.goto(`/projects/${id}`)
  log.push(`trashed project page as admin: status text 404 visible=${await page.getByText("404").first().isVisible().catch(() => false)}`)
  await page.goto("/admin/trash")
  const item = page.locator("li").filter({ hasText: name })
  await expect(item).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: shot("admin-trash-list"), fullPage: true })
  await item.getByRole("button", { name: /復元|Restore|Pulihkan/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^(復元|Restore|Pulihkan)$/ }).click()
  await expect(item).toHaveCount(0, { timeout: 15_000 })
  await page.waitForLoadState("networkidle")
  const t0 = Date.now()
  let st = 0
  const seq: number[] = []
  while (Date.now() - t0 < 60_000) {
    st = (await po.get(`/api/projects/${id}`)).status()
    seq.push(st)
    if (st === 200) break
    await page.waitForTimeout(500)
  }
  log.push(`after restore: po GET -> ${st} after ${Date.now() - t0} ms (seq ${seq.join(",")})`)
  expect(st).toBe(200)

  // Trash again and purge from the UI
  await po.delete(`/api/projects/${id}`)
  await page.reload()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.getByRole("button", { name: /完全に削除|Delete permanently|Hapus permanen/ }).click()
  const dlg = page.getByRole("alertdialog")
  log.push(`purge dialog: ${(await dlg.textContent())?.slice(0, 200)}`)
  const purgeRes = page.waitForResponse((r) => r.url().endsWith(`/api/admin/trash/projects/${id}`) && r.request().method() === "DELETE")
  await dlg.getByRole("button", { name: /完全に削除|Delete permanently|Hapus permanen/ }).click()
  await expect(item).toHaveCount(0, { timeout: 15_000 })
  log.push(`purge response -> ${(await purgeRes).status()}`)
  const purged = await admin.post(`/api/admin/trash/projects/${id}/restore`)
  log.push(`restore after purge -> ${purged.status()}`)
  expect(purged.status()).toBe(404)
  await ctx.close()
})

test("/api/health fields", async () => {
  const anon = await (await import("@playwright/test")).request.newContext({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3102" })
  const r = await anon.get("/api/health")
  const j = await r.json()
  log.push(`health (anonymous) -> ${r.status()} ${JSON.stringify(j)}`)
  log.push(`health headers cache-control=${r.headers()["cache-control"]}`)
  expect(r.status()).toBe(200)
  // This runner calls from loopback (like the ops scripts) → full detail.
  for (const k of ["status", "db", "ollama", "worker", "translation", "uptime", "buildId"]) expect(j).toHaveProperty(k)
  // S-2: a remote anonymous client (non-loopback X-Forwarded-For hop) sees only { status, db }.
  const remote = await anon.get("/api/health", { headers: { "x-forwarded-for": "10.20.30.40" } })
  expect(remote.status()).toBe(200)
  expect(await remote.json()).toEqual({ status: "ok", db: "ok" })
})

test.afterAll(() => {
  fs.appendFileSync(`${DATA}/platform-admin.log`, log.join("\n") + "\n")
  note({ kind: "admin", log })
})

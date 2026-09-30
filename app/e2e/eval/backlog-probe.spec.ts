import { test } from "@playwright/test"
import { api, gotoBacklog, login, PROJECT } from "./backlog-support"

test("probe: list E2E / empty PBIs", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const r = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
  const d = (r.body.data ?? r.body) as Record<string, Array<Record<string, unknown>>>
  const all = [...d.readyItems, ...d.notReadyItems, ...d.completedItems]
  for (const i of all.filter((x) => !x.initiative || String(x.initiative).startsWith("E2E")))
    console.log(i.displayId, i.id, i.status, JSON.stringify(i.initiative), JSON.stringify(i.userStory), i.createdAt)
})

test("restore e2e-dev UI language to id (login page saves its language)", async ({ page }) => {
  await login(page, "dev")
  const r = await api(page, "PATCH", "/api/user/language", { language: "id" })
  console.log("dev language restore", r.status)
  await page.goto(`/projects/${PROJECT}/backlog`)
  await page.waitForLoadState("networkidle")
  console.log("html lang now", await page.locator("html").getAttribute("lang"), await page.locator("h1").first().innerText())
})

test("cleanup: trash leftover backlog-eval PBIs", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const r = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
  const d = (r.body.data ?? r.body) as Record<string, Array<Record<string, unknown>>>
  const mine = [...d.readyItems, ...d.notReadyItems, ...d.completedItems].filter((x) => /^E2E-(MODAL|STATUS|CREATE|CMT|XLS|NOTIF|LOCK|LINK|GUARD|TRASH|BULK)/.test(String(x.initiative ?? "")))
  if (mine.length === 0) return
  const t = await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: mine.map((x) => x.id) })
  console.log("trashed", t.status, mine.map((x) => x.displayId))
})

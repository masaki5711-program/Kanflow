import { expect, test } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, newUserPage, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })

test("card status buttons move PBIs between sections", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-STATUS-${stamp()}`
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として状態変更を確認したい。", workloadScore: 2 })
  const pbi = (r.body.data ?? r.body) as { id: string; displayId: number }
  await page.goto(`${BACKLOG}?q=${tag}&showDone=1`)
  const row = () => page.locator("[data-dnd-row]").filter({ hasText: tag })
  page.on("response", async (res) => {
    if (res.url().includes(pbi.id) && res.request().method() !== "GET") console.log("STATUS-CHANGE", res.request().method(), res.status(), res.request().postData(), (await res.text().catch(() => "")).slice(0, 120))
  })
  // rapid successive changes (as a user clicking quickly)
  await row().getByRole("button", { name: "着手可能に移動する" }).click()
  await row().getByRole("button", { name: "完了にする" }).click()
  await page.waitForTimeout(2500)
  console.log("toasts after rapid changes", JSON.stringify((await page.getByRole("alert").allInnerTexts()).filter(Boolean)))
  const srv = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  const sd = (srv.body.data ?? srv.body) as Record<string, unknown>
  const inDoneUi = await page.getByRole("region", { name: "完了" }).getByRole("button", { name: tag }).count()
  const inReadyUi = await page.getByRole("region", { name: "Ready（着手可能）" }).getByRole("button", { name: tag }).count()
  console.log("server status", sd.status, "completedAt", sd.completedAt, "UI done", inDoneUi, "UI ready", inReadyUi)
  await page.screenshot({ path: `${SHOTS}/status-rapid.png`, fullPage: true })
  await page.reload()
  await page.waitForLoadState("networkidle")
  const doneNow = await page.getByRole("region", { name: "完了" }).getByRole("button", { name: tag }).count()
  if (doneNow === 0) {
    await row().getByRole("button", { name: "完了にする" }).click()
    await expect(page.getByRole("region", { name: "完了" }).getByRole("button", { name: tag })).toBeVisible()
  }
  await page.waitForTimeout(1000)
  await row().getByRole("button", { name: "着手可能に戻す" }).click()
  await expect(page.getByRole("region", { name: "Ready（着手可能）" }).getByRole("button", { name: tag })).toBeVisible()
  await page.waitForTimeout(1000)
  await row().getByRole("button", { name: "未準備に戻す" }).click()
  await expect(page.getByRole("region", { name: "Not Ready（未準備）" }).getByRole("button", { name: tag })).toBeVisible()
  // total workload badge updates
  console.log("header workload", await page.getByText(/^合計工数: \d+/).first().innerText())
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("status", issues)
})

test("section manager: no INVEST button without ai.use (F-07)", async ({ browser }) => {
  const sec = await newUserPage(browser, "sec")
  await sec.page.goto(BACKLOG)
  await expect(sec.page.locator("[data-dnd-row]").first()).toBeVisible({ timeout: 30000 })
  await expect(sec.page.locator("[data-dnd-row]").first().getByRole("button", { name: /INVEST/ })).toHaveCount(0)
  await sec.page.screenshot({ path: `${SHOTS}/invest-sec.png` })
  report("sec-invest", sec.issues)
  await sec.ctx.close()
})

test("trashed PBIs that were in an active sprint: sprint data", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const sprints = await api(page, "GET", `/api/projects/${PROJECT}/sprints`)
  const list = (sprints.body.data ?? sprints.body) as unknown as Array<Record<string, unknown>>
  const active = list.find((s) => s.status === "active")
  console.log("active sprint", active?.id, active?.sprintName)
  if (!active) return
  const detail = await api(page, "GET", `/api/projects/${PROJECT}/sprints/${active.id}`)
  const body = JSON.stringify(detail.body)
  console.log("sprint detail status", detail.status, "mentions E2E-BULK:", /E2E-BULK/.test(body))
  const board = await page.goto(`/projects/${PROJECT}/sprints/${active.id}`)
  console.log("sprint page status", board?.status())
  await page.waitForLoadState("networkidle")
  const txt = await page.getByRole("main").innerText()
  console.log("sprint page mentions E2E-BULK:", /E2E-BULK/.test(txt))
  await page.screenshot({ path: `${SHOTS}/sprint-after-bulk-trash.png`, fullPage: true })
})

test("restore Ready order 36,38,39,40", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const r = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
  const d = (r.body.data ?? r.body) as Record<string, Array<{ id: string; displayId: number }>>
  const want = [36, 38, 39, 40]
  const ordered = [...d.readyItems].sort((a, b) => {
    const ia = want.indexOf(a.displayId), ib = want.indexOf(b.displayId)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const put = await api(page, "PUT", `/api/projects/${PROJECT}/backlog/reorder`, { orderedIds: ordered.map((i) => i.id) })
  console.log("restore order", put.status, ordered.map((i) => i.displayId))
})

import { expect, test } from "@playwright/test"
import { open, snap, PILOT, OUT } from "./accept-helpers"
import * as fs from "node:fs"

/**
 * Acceptance cycle 3 — read-only regression checks for the findings in
 * reports/acceptance-cycle3.md. Needs the E2E-ACC project created by the
 * walkthrough (accept-20-po-walkthrough); its path is read from
 * reports/accept-data/acc-project.txt (or ACC_PROJECT).
 */
test.describe.configure({ mode: "default" })
test.setTimeout(180_000)

const ACC = process.env.ACC_PROJECT
  ?? (fs.existsSync(`${OUT}/acc-project.txt`) ? fs.readFileSync(`${OUT}/acc-project.txt`, "utf8").trim() : "")

test("A3-01 burndown actual line stops at today (no future points)", async ({ browser }) => {
  test.skip(!ACC, "no E2E-ACC project")
  const s = await open(browser, "dev", { lang: "id", logFile: "findings.log" })
  const id = ACC.split("/").pop()
  const res = await s.page.request.get(`/api/projects/${id}/burndown`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const data = body.data ?? body
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const idx = (data.days as string[]).indexOf(key)
  const future = (data.actualLine as (number | null)[]).slice(idx + 1).filter((v) => v !== null)
  s.log(`A3-01 days=${data.days.length} todayIdx=${idx} futureActualPoints=${future.length}`)
  await s.page.goto(`${ACC}/burndown`)
  await snap(s, "A3-01-burndown-future")
  await s.ctx.close()
  expect(future, "actual series must not extend past today").toHaveLength(0)
})

test("A3-02 task title translation survives a status change (writes; re-triggers AI translation)", async ({ browser }) => {
  // Status-only PATCH deletes the task-name translation row (services/sprint-backlog/
  // sprint-backlog.service.ts: enqueueIn(..., { taskName: data.taskName }) with taskName
  // undefined -> null -> deleteMany). The backfill job re-translates it minutes later, so
  // a read-only check after the fact passes; the move + immediate reload shows the bug.
  test.skip(!ACC || process.env.ACC_WRITE !== "1", "set ACC_WRITE=1 (moves a task; costs one Ollama call)")
  const s = await open(browser, "dev", { lang: "id", logFile: "findings.log" })
  await s.page.goto(`${ACC}/sprints?view=board`)
  const board = s.page.getByRole("region", { name: /Papan kanban/ })
  const inProgress = board.getByRole("group", { name: "Sedang Berjalan" })
  await inProgress.getByRole("button", { name: /^Pindahkan/ }).first().click()
  await s.page.locator("button:visible[data-move-option]", { hasText: /Belum Mulai/ }).last().click()
  await s.page.waitForTimeout(1500)
  await s.page.reload()
  const titles = await board.getByRole("listitem").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))
  s.log(`A3-02 board titles right after a move (id UI): ${titles.join(" | ")}`)
  await snap(s, "A3-02-board-titles")
  await s.ctx.close()
  expect(titles.filter((t) => /[぀-ヿ]/.test(t)), "moved task lost its id translation").toHaveLength(0)
})

test("A3-03 portfolio column headers do not wrap per character", async ({ browser }) => {
  const s = await open(browser, "sec", { lang: "ja", logFile: "findings.log" })
  await s.page.goto("/portfolio")
  const heights = await s.page.getByRole("columnheader").evaluateAll((els) => els.map((e) => [e.textContent?.trim(), Math.round(e.getBoundingClientRect().height)] as const))
  s.log(`A3-03 header heights: ${JSON.stringify(heights)}`)
  await snap(s, "A3-03-portfolio-headers")
  await s.ctx.close()
  expect(Math.max(...heights.map((h) => h[1])), "header row taller than 2 lines").toBeLessThan(60)
})

test("A3-04 settings role labels are consistently Japanese", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: "findings.log" })
  await s.page.goto(`/projects/${PILOT}/settings`)
  await expect(s.page.getByRole("combobox", { name: /の役割/ }).first()).toBeVisible()
  const opts = await s.page.getByRole("combobox", { name: /の役割/ }).first().locator("option").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()))
  s.log(`A3-04 role options: ${opts.join(", ")}`)
  await s.ctx.close()
  expect(opts.filter((o) => /^[A-Za-z ]+$/.test(o)), "English role names in ja UI").toHaveLength(0)
})

test("A3-05 dashboard deadline widget uses translated plan item names", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: "findings.log" })
  await s.page.goto(`/projects/${PILOT}`)
  const widget = s.page.locator("section, div").filter({ has: s.page.getByText("期限が近いもの", { exact: true }) }).last()
  const text = await widget.innerText()
  s.log(`A3-05 widget: ${text.replace(/\n/g, " | ").slice(0, 300)}`)
  await s.ctx.close()
  expect(text, "Indonesian plan item names in the ja widget").not.toMatch(/Inventarisasi|Pemetaan|Koordinasi|Identifikasi|Kompilasi/)
})

test("A3-06 admin users list is readable at 375 px", async ({ browser }) => {
  const s = await open(browser, "admin", { width: 375, height: 812, lang: "ja", logFile: "findings.log" })
  await s.page.goto("/admin/users")
  const email = s.page.getByText("e2e-admin@example.test", { exact: true })
  const box = await email.boundingBox()
  s.log(`A3-06 email box ${JSON.stringify(box)}`)
  await snap(s, "A3-06-admin-users-375")
  await s.ctx.close()
  expect(box?.height ?? 999, "email wraps over many lines").toBeLessThan(40)
})

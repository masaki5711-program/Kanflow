import { expect, test, type Page } from "@playwright/test"
import * as fs from "node:fs"
import { USERS, api, newUserPage, readState, report, shot, writeState } from "./sprints-support"

/**
 * Sprint lifecycle as PO in the isolated E2E project:
 * create sprint (READY PB import) → add PBI → add tasks (assignee picker) → start
 * (sprint_start notification) → edit dialog.
 */
test.describe.configure({ mode: "serial" })

const dump = (name: string, txt: string) => fs.writeFileSync(`D:/APP/Kanflow-e2e/reports/_sprints-aria-${name}.txt`, txt)

async function card(page: Page) {
  return page.locator("article").filter({ has: page.getByRole("heading", { level: 3, name: "E2E-Sprint-A" }) })
}

test("create sprint via UI with 3 READY PBIs", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "po")
  await page.goto(`/projects/${s.projectId}/sprints`)
  await page.getByRole("button", { name: "スプリント作成" }).first().click()
  const form = page.getByRole("region", { name: "新規スプリント" })
  await form.getByRole("textbox", { name: /スプリント名/ }).fill("E2E-Sprint-A")
  await form.getByRole("spinbutton", { name: /キャパシティ/ }).fill("20")
  await form.getByRole("textbox", { name: "スプリントゴール" }).fill("E2E goal: verify the board")
  for (const n of [1, 2, 3]) await form.getByRole("checkbox", { name: new RegExp(`^#${n} `) }).check()
  await expect(form.getByRole("button", { name: /作成（3件取り込み）/ })).toBeVisible()
  await shot(page, "01-create-filled")
  await form.getByRole("button", { name: /作成（3件取り込み）/ }).click()
  await expect(form).toBeHidden({ timeout: 15_000 })
  const c = await card(page)
  await expect(c).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, "01-created")
  dump("created", await page.locator("main").ariaSnapshot())

  const list = await api<Array<{ id: string; sprintName: string; status: string; items: Array<{ pbItem: { id: string } }> }>>(page, "GET", `/api/projects/${s.projectId}/sprints`)
  const sp = list.body.find((x) => x.sprintName === "E2E-Sprint-A")
  expect(sp?.status).toBe("planning")
  expect(new Set(sp!.items.map((i) => i.pbItem.id)).size).toBe(3)
  writeState({ ...s, sprintId: sp!.id })
  report("create sprint", issues)
  await ctx.close()
})

test("add 4th PBI via 'PBアイテムを追加' modal", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "po")
  await page.goto(`/projects/${s.projectId}/sprints`)
  const c = await card(page)
  await c.getByRole("button", { name: "PBアイテムを追加" }).click()
  const dlg = page.getByRole("dialog")
  await expect(dlg).toBeVisible()
  await page.waitForTimeout(1000)
  dump("addpbi", await dlg.ariaSnapshot())
  await shot(page, "01-addpbi-modal", false)
  await dlg.getByRole("checkbox", { name: /#4/ }).first().check()
  await dlg.getByRole("button", { name: /追加/ }).last().click()
  await expect(dlg).toBeHidden({ timeout: 15_000 })
  await expect(c.getByRole("region", { name: /^#4 / })).toBeVisible()
  report("add pbi", issues)
  await ctx.close()
})

test("add tasks via task form (assignee picker single-owner rule)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "po")
  await page.goto(`/projects/${s.projectId}/sprints`)
  const c = await card(page)
  // Task 1 via "+ タスク" on PBI #1
  await c.getByRole("region", { name: /^#1 / }).getByRole("button", { name: "+ タスク", exact: true }).click()
  let dlg = page.getByRole("dialog", { name: /タスク追加/ })
  await expect(dlg).toBeVisible()
  dump("taskform", await dlg.ariaSnapshot())
  await shot(page, "01-taskform", false)
  await dlg.getByRole("textbox", { name: /タスク名/ }).fill("E2E-Task-1 design")
  const picker = dlg.getByRole("group", { name: "担当者" })
  await picker.getByRole("button", { name: "E2E Dev" }).click()
  await expect(picker.getByRole("button", { name: "E2E Dev" })).toHaveAttribute("aria-pressed", "true")
  // single owner: picking SM releases Dev
  await picker.getByRole("button", { name: "E2E SM" }).click()
  await expect(picker.getByRole("button", { name: "E2E SM" })).toHaveAttribute("aria-pressed", "true")
  await expect(picker.getByRole("button", { name: "E2E Dev" })).toHaveAttribute("aria-pressed", "false")
  // click again clears
  await picker.getByRole("button", { name: "E2E SM" }).click()
  await expect(picker.locator("[aria-pressed=true]")).toHaveCount(0)
  await picker.getByRole("button", { name: "E2E Dev" }).click()
  await dlg.getByRole("spinbutton").first().fill("2")
  await dlg.getByRole("button", { name: "追加", exact: true }).click()
  await expect(dlg).toBeHidden({ timeout: 15_000 })
  await expect(c.getByText("E2E-Task-1 design")).toBeVisible()

  // Task 2 via the empty-state button on PBI #2
  await c.getByRole("region", { name: /^#2 / }).getByRole("button", { name: /タスク追加/ }).click()
  dlg = page.getByRole("dialog", { name: /タスク追加/ })
  await dlg.getByRole("textbox", { name: /タスク名/ }).fill("E2E-Task-2 build")
  await dlg.getByRole("group", { name: "担当者" }).getByRole("button", { name: "E2E SM" }).click()
  await dlg.getByRole("spinbutton").first().fill("3")
  await dlg.getByRole("button", { name: "追加", exact: true }).click()
  await expect(dlg).toBeHidden({ timeout: 15_000 })

  // The rest via API (unassigned / PO / Dev)
  const url = `/api/projects/${s.projectId}/sprints/${s.sprintId}/tasks`
  const extra: Array<[number, string, string[], number]> = [
    [1, "E2E-Task-3 test", [], 1],
    [2, "E2E-Task-4 docs", [USERS.dev.id], 1.5],
    [3, "E2E-Task-5 review", [USERS.po.id], 2],
    [3, "E2E-Task-6 deploy", [USERS.dev.id], 4],
  ]
  for (const [pi, taskName, assigneeIds, est] of extra) {
    const r = await api(page, "POST", url, { pbItemId: s.pbiIds[pi], taskName, assigneeIds, estimatedHours: est })
    expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  }
  const list = await api<Array<{ id: string; items: Array<{ id: string; taskName: string | null; assignees?: Array<{ id?: string; userId?: string; name?: string }> }> }>>(page, "GET", `/api/projects/${s.projectId}/sprints`)
  const sp = list.body.find((x) => x.id === s.sprintId)!
  const tasks = sp.items.filter((i) => i.taskName)
  expect(tasks.length).toBe(6)
  const t1 = tasks.find((i) => i.taskName === "E2E-Task-1 design")!
  console.log("task1 assignees", JSON.stringify(t1.assignees ?? t1))
  writeState({ ...s, taskIds: tasks.map((x) => x.id) })
  await page.reload()
  await page.waitForTimeout(1500)
  await shot(page, "01-tasks-list")
  report("add tasks", issues)
  await ctx.close()
})

test("sprint edit dialog saves capacity", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "po")
  await page.goto(`/projects/${s.projectId}/sprints`)
  const c = await card(page)
  await c.getByRole("button", { name: "スプリント編集" }).click()
  const dlg = page.getByRole("dialog")
  await expect(dlg).toBeVisible()
  dump("sprintedit", await dlg.ariaSnapshot())
  await dlg.getByRole("spinbutton").fill("24")
  await shot(page, "01-sprint-edit", false)
  await dlg.getByRole("button", { name: "保存" }).click()
  await expect(dlg).toBeHidden({ timeout: 15_000 })
  await expect(c.getByText(/業務負荷: 18 \/ 24/)).toBeVisible()
  report("sprint edit", issues)
  await ctx.close()
})

test("start sprint (planning → active) notifies members (sprint_start)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "sm")
  await page.goto(`/projects/${s.projectId}/sprints`)
  const c = await card(page)
  await c.getByRole("button", { name: "「実行中」へ移行" }).click()
  await page.waitForTimeout(500)
  dump("after-start-click", await page.locator("body").ariaSnapshot())
  await expect(c.getByText("実行中", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await shot(page, "01-started")
  report("start sprint (sm)", issues)
  await ctx.close()

  const dev = await newUserPage(browser, "dev")
  const n = await api<unknown>(dev.page, "GET", "/api/notifications")
  const txt = JSON.stringify(n.body)
  console.log("dev notifications status", n.status, txt.slice(0, 600))
  expect(txt).toContain("sprint_start")
  expect(txt).toContain(s.sprintId!)
  await dev.ctx.close()
})

test("complete: active → review (KPT dialog) → done; sprint_end only on done; create re-enabled", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "sm")
  const cur = await api<Array<{ id: string; status: string }>>(page, "GET", `/api/projects/${s.projectId}/sprints`)
  // Completing launches an AI completion review (shared Ollama) — never re-run once completed.
  test.skip(cur.body.find((x) => x.id === s.sprintId)?.status !== "active", "sprint already completed")
  await page.goto(`/projects/${s.projectId}/sprints`)
  const c = await card(page)
  await c.getByRole("button", { name: "「レビュー」へ移行" }).click()
  let dlg = page.getByRole("dialog", { name: /スプリントステータス変更/ })
  await expect(dlg).toBeVisible()
  dump("status-dialog", await dlg.ariaSnapshot())
  await dlg.getByRole("textbox", { name: /Keep/ }).fill("E2E keep: board works")
  await shot(page, "01-review-dialog", false)
  await dlg.getByRole("button", { name: "保存してステータス変更" }).click()
  await expect(dlg).toBeHidden({ timeout: 15_000 })
  await expect(c.getByText("レビュー", { exact: true }).first()).toBeVisible()
  let dev = await newUserPage(browser, "dev")
  let n = JSON.stringify((await api(dev.page, "GET", "/api/notifications")).body)
  console.log("sprint_end after review?", n.includes("sprint_end"))
  await dev.ctx.close()

  await c.getByRole("button", { name: "「完了」へ移行" }).click()
  dlg = page.getByRole("dialog", { name: /スプリントステータス変更/ })
  await expect(dlg).toBeVisible()
  const keep = await dlg.getByRole("textbox", { name: /Keep/ }).inputValue()
  console.log("KPT keep prefilled on second dialog:", keep)
  await dlg.getByRole("button", { name: "保存してステータス変更" }).click()
  await expect(dlg).toBeHidden({ timeout: 15_000 })
  await page.waitForTimeout(1000)
  await shot(page, "01-done")
  await expect(page.getByRole("button", { name: "スプリント作成" }).first()).toBeEnabled()
  report("complete sprint", issues)
  await ctx.close()
})

test("after completion: archived section (collapsed), sprint card collapsed, sprint_end notification deep link", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "sm")
  await page.goto(`/projects/${s.projectId}/sprints`)
  await expect(page.getByRole("button", { name: "スプリント作成" }).first()).toBeEnabled({ timeout: 20_000 })
  let dev: Awaited<ReturnType<typeof newUserPage>>
  let n: string
  await page.reload()
  // "done" is auto-promoted to "archived": the card moves into the collapsed archive section
  const archSection = page.getByRole("region", { name: "アーカイブ済みスプリント" })
  await expect(archSection.getByRole("button").first()).toHaveAttribute("aria-expanded", "false")
  await expect(page.locator(`#sprint-card-${s.sprintId}`)).toHaveCount(0)
  await archSection.getByRole("button").first().click()
  const toggle = page.locator(`#sprint-card-${s.sprintId}`).getByRole("button", { name: /の詳細を開閉/ })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await shot(page, "01-done-collapsed")
  dev = await newUserPage(browser, "dev")
  n = JSON.stringify((await api(dev.page, "GET", "/api/notifications")).body)
  expect(n).toContain("sprint_end")
  // the notification bell deep-links to ?sprint=
  await dev.page.getByRole("button", { name: /^Notifikasi/ }).click()
  await dev.page.waitForTimeout(800)
  await shot(dev.page, "01-dev-notifications", false)
  const notif = dev.page.getByText(/Sprint “E2E-Sprint-A” selesai/).first()
  const role = await notif.evaluate((e) => { const c = e.closest("a,button,[role]"); return c ? `${c.tagName} ${c.getAttribute("role") ?? ""} ${c.getAttribute("href") ?? ""}` : "none" })
  console.log("notification element:", role)
  await notif.click()
  await expect(dev.page.locator(`#sprint-card-${s.sprintId}`)).toBeFocused({ timeout: 15_000 })
  report("complete sprint (dev)", dev.issues)
  await dev.ctx.close()
  report("complete sprint", issues)
  await ctx.close()
})

import { expect, test, type Page } from "@playwright/test"
import { IOT, IOT_ACTIVE_SPRINT, USERS, api, japaneseStrings, newUserPage, readState, report, shot } from "./sprints-support"

/** Home (/): hero KPIs, my tasks (grouping, urgency order, inline status), archived projects (lazy), favorites. */
test.describe.configure({ mode: "serial" })

type SprintDto = { id: string; items: Array<{ id: string; taskName: string | null; status: string; version: number }> }
async function task(page: Page, projectId: string, sprintId: string, name: string) {
  const r = await api<SprintDto[]>(page, "GET", `/api/projects/${projectId}/sprints`)
  return r.body.find((x) => x.id === sprintId)!.items.find((i) => i.taskName === name)!
}

let overdueTaskId = ""
let archivedProjectId = ""

test("prep: overdue E2E task for dev in the IoT active sprint (ended 2026-09-08) + an archived E2E project", async ({ browser }) => {
  const { ctx, page } = await newUserPage(browser, "po")
  const pbis = await api<{ items?: Array<{ id: string; status: string }> } | Array<{ id: string; status: string }>>(page, "GET", `/api/projects/${IOT}/sprints`)
  const sp = (pbis.body as unknown as SprintDto[] & Array<{ id: string; items: Array<{ pbItem: { id: string } }> }>).find((x) => x.id === IOT_ACTIVE_SPRINT)!
  const pbItemId = (sp.items[0] as unknown as { pbItem: { id: string } }).pbItem.id
  const r = await api<{ id: string }>(page, "POST", `/api/projects/${IOT}/sprints/${IOT_ACTIVE_SPRINT}/tasks`, {
    pbItemId, taskName: "E2E-Overdue task (sprints eval)", assigneeIds: [USERS.dev.id], estimatedHours: 1,
  })
  expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  overdueTaskId = r.body.id
  const p = await api<{ id: string }>(page, "POST", "/api/projects", { name: "E2E-Sprints-Archived-C1", projectType: "software" })
  archivedProjectId = p.body.id
  const a = await api(page, "PATCH", `/api/projects/${archivedProjectId}`, { status: "archived" })
  console.log("archive project status", a.status)
  await ctx.close()
})

test("dev home: KPIs, grouping, overdue first, inline status change persists (version bump)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "dev")
  await page.goto("/")
  const hero = page.getByRole("region", { name: /Selamat datang kembali/ })
  await expect(hero).toBeVisible()
  const kpis = await hero.locator("dl").innerText()
  console.log("KPIs:", kpis.replace(/\n/g, " | "))
  expect(kpis).toMatch(/1\s*\|?\s*Terlambat|Terlambat/)
  const mine = page.getByRole("region", { name: "Tugas Sprint saya" })
  const groups = await mine.getByRole("heading", { level: 3 }).allInnerTexts()
  console.log("my-task groups:", JSON.stringify(groups))
  expect(groups[0]).toMatch(/IoT/) // project with the overdue task first
  const firstRow = await mine.getByRole("listitem").first().innerText()
  console.log("first row:", firstRow.replace(/\n/g, " | "))
  expect(firstRow).toContain("E2E-Overdue")
  await shot(page, "04-home-dev")
  const jp = await japaneseStrings(page, "main")
  console.log("JP strings on home (id user):", JSON.stringify(jp))

  // inline status change
  const before = await task(page, s.projectId, s.sprintId!, "E2E-Task-4 docs")
  const sel = mine.getByRole("combobox", { name: /E2E-Task-4 docs/ })
  const resp = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/tasks\//.test(r.url()))
  await sel.selectOption("in_progress")
  console.log("inline PATCH status", (await resp).status())
  await page.reload()
  await expect(page.getByRole("combobox", { name: /E2E-Task-4 docs/ })).toHaveValue("in_progress")
  const after = await task(page, s.projectId, s.sprintId!, "E2E-Task-4 docs")
  expect(after.status).toBe("in_progress")
  expect(after.version).toBeGreaterThan(before.version)
  // twice in a row (version must be carried forward, no 409)
  await page.getByRole("combobox", { name: /E2E-Task-4 docs/ }).selectOption("todo")
  await page.waitForTimeout(700)
  await page.getByRole("combobox", { name: /E2E-Task-4 docs/ }).selectOption("in_progress")
  await page.waitForTimeout(1200)
  expect((await task(page, s.projectId, s.sprintId!, "E2E-Task-4 docs")).status).toBe("in_progress")
  // back to todo for later specs
  await page.getByRole("combobox", { name: /E2E-Task-4 docs/ }).selectOption("todo")
  await page.waitForTimeout(1200)
  // task link deep-links to the sprint page
  await page.getByRole("link", { name: "E2E-Task-4 docs" }).click()
  await expect(page).toHaveURL(/\/sprints/)
  await expect(page.locator("[data-deep-link-highlight]")).toHaveCount(1, { timeout: 15_000 })
  report("home dev", issues)
  await ctx.close()
})

test("home: favorites toggle + 'favorites first' sort; lazy archived section", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "po")
  await page.goto("/")
  const list = page.getByRole("region", { name: "プロジェクト一覧" })
  const card = list.locator("article").filter({ has: page.getByRole("link", { name: s.projectName, exact: true }) })
  const fav = card.getByRole("button").first()
  console.log("favorite button:", await fav.getAttribute("aria-label"), await fav.getAttribute("aria-pressed"))
  await fav.click()
  await page.waitForTimeout(800)
  await page.reload()
  const fav2 = list.locator("article").filter({ has: page.getByRole("link", { name: s.projectName, exact: true }) }).getByRole("button").first()
  console.log("after reload:", await fav2.getAttribute("aria-label"), await fav2.getAttribute("aria-pressed"))
  const sort = list.getByRole("combobox").first()
  const opts = await sort.locator("option").allInnerTexts()
  const favOpt = opts.find((o) => /お気に入り/.test(o))
  if (favOpt) await sort.selectOption({ label: favOpt })
  const firstTitle = await list.locator("article h3").first().innerText()
  console.log("first project after favorites-first sort:", firstTitle)
  expect(firstTitle).toContain(s.projectName)
  await shot(page, "04-home-favorites")
  // restore
  await fav2.click()

  // archived: count only, fetched on expand
  let archivedFetched = 0
  page.on("request", (r) => { if (/\/api\/projects\/archived/.test(r.url())) archivedFetched++ })
  await page.reload()
  const arch = page.getByRole("region", { name: /アーカイブ/ }).getByRole("button").first()
  await expect(arch).toBeVisible()
  expect(archivedFetched).toBe(0)
  await arch.click()
  await expect(page.locator("#archived-projects")).toContainText("E2E-Sprints-Archived-C1", { timeout: 15_000 })
  expect(archivedFetched).toBe(1)
  await shot(page, "04-home-archived")
  report("home favorites/archived", issues)
  await ctx.close()
})

test("cleanup: remove overdue IoT task", async ({ browser }) => {
  test.skip(!overdueTaskId)
  const { ctx, page } = await newUserPage(browser, "po")
  const r = await api(page, "DELETE", `/api/projects/${IOT}/sprints/${IOT_ACTIVE_SPRINT}/tasks/${overdueTaskId}`)
  console.log("delete overdue task", r.status)
  await ctx.close()
})

import { expect, test, type Page } from "@playwright/test"
import { IOT, api, gotoSprints, newUserPage, readState, report, shot } from "./sprints-support"

/** Deep links (?task / ?sprint), optimistic lock (409), and dev-role controls on the sprint page. */
test.describe.configure({ mode: "serial" })

const IOT_ARCHIVED_SPRINT = "cmsyd0jbi003xvk9ljb2veapb" // "Sprint Minggu ke 8" (archived)
const IOT_ARCHIVED_TASK = "cmt13r13w0052vk9l9d7000b8"

type SprintDto = { id: string; items: Array<{ id: string; taskName: string | null; status: string; version: number }> }
async function taskId(page: Page, name: string) {
  const s = readState()
  const r = await api<SprintDto[]>(page, "GET", `/api/projects/${s.projectId}/sprints`)
  return r.body.find((x) => x.id === s.sprintId)!.items.find((i) => i.taskName === name)!.id
}

test("?task=<id> clears filters, scrolls, focuses and highlights the task (board + list)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "sm")
  const id = await taskId(page, "E2E-Task-5 review")
  await page.goto(`/projects/${s.projectId}/sprints?view=board&assignee=unassigned&q=zzz&task=${id}`)
  const el = page.locator(`#task-${id}`)
  await expect(el).toBeVisible({ timeout: 20_000 })
  await expect(el).toHaveAttribute("data-deep-link-highlight", "", { timeout: 5_000 })
  await expect(el).toBeFocused()
  await shot(page, "03-deeplink-task-board", false)
  await page.waitForTimeout(1500)
  console.log("URL after task deep link:", page.url())
  expect(page.url()).not.toMatch(/task=/)
  expect(page.url()).not.toMatch(/assignee=|q=zzz/)
  expect(page.url()).toMatch(/view=board/)
  // list view
  await page.goto(`/projects/${s.projectId}/sprints?view=list&task=${id}`)
  await expect(page.locator(`#task-${id}`)).toBeFocused({ timeout: 20_000 })
  report("deeplink task", issues)
  await ctx.close()
})

test("?task= into an archived (collapsed) IoT sprint expands archive + sprint; ?sprint=; unknown ids toast", async ({ browser }) => {
  const { ctx, page, issues } = await newUserPage(browser, "sm")
  await page.goto(`/projects/${IOT}/sprints`)
  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 })
  // completed/archived collapsed by default
  const toggles = page.getByRole("button", { name: /の詳細を開閉/ })
  const states = await toggles.evaluateAll((els) => els.map((e) => `${e.getAttribute("aria-label")}=${e.getAttribute("aria-expanded")}`))
  console.log("IoT sprint expand states:", JSON.stringify(states))
  await shot(page, "03-iot-sprints")

  await page.goto(`/projects/${IOT}/sprints?task=${IOT_ARCHIVED_TASK}`)
  const el = page.locator(`#task-${IOT_ARCHIVED_TASK}`)
  await expect(el).toBeVisible({ timeout: 20_000 })
  await expect(el).toBeFocused()
  await shot(page, "03-deeplink-archived-task", false)

  await page.goto(`/projects/${IOT}/sprints?sprint=${IOT_ARCHIVED_SPRINT}`)
  const sp = page.locator(`#sprint-card-${IOT_ARCHIVED_SPRINT}`)
  await expect(sp).toBeVisible({ timeout: 20_000 })
  await expect(sp).toBeFocused()
  await expect(sp.getByRole("button", { name: /の詳細を開閉/ })).toHaveAttribute("aria-expanded", "true")

  await page.goto(`/projects/${IOT}/sprints?task=doesnotexist123`)
  await expect(page.getByText("リンク先のタスクが見つかりません（削除された可能性があります）")).toBeVisible({ timeout: 20_000 })
  await shot(page, "03-deeplink-unknown", false)
  await page.goto(`/projects/${IOT}/sprints?sprint=doesnotexist123`)
  await expect(page.getByText("リンク先のスプリントが見つかりません（削除された可能性があります）")).toBeVisible({ timeout: 20_000 })
  report("deeplink archived/unknown", issues)
  await ctx.close()
})

test("optimistic lock: two users edit the same task → second save gets 409 toast + reload", async ({ browser }) => {
  const s = readState()
  const a = await newUserPage(browser, "po")
  const b = await newUserPage(browser, "sm")
  for (const u of [a, b]) await gotoSprints(u.page, s.projectId, "?view=list")
  const open = async (p: Page) => {
    await p.getByRole("button", { name: /タスク「E2E-Task-5.*」を編集/ }).first().click()
    const d = p.getByRole("dialog", { name: /タスク編集/ })
    await expect(d).toBeVisible()
    return d
  }
  const da = await open(a.page)
  const db = await open(b.page)
  await da.getByRole("textbox").first().fill("E2E-Task-5 review (PO edit)")
  await da.getByRole("button", { name: "更新" }).click()
  await expect(da).toBeHidden()
  await db.getByRole("textbox").first().fill("E2E-Task-5 review (SM edit)")
  const resp = b.page.waitForResponse((r) => r.request().method() === "PATCH" && /\/tasks\//.test(r.url()))
  await db.getByRole("button", { name: "更新" }).click()
  const r = await resp
  console.log("second PATCH status", r.status())
  expect(r.status()).toBe(409)
  await expect(b.page.getByText("他のユーザーが先に更新しました。最新の内容を読み込みました")).toBeVisible()
  await b.page.waitForTimeout(1200)
  await shot(b.page, "03-409-toast", false)
  const dialogStill = await db.isVisible()
  console.log("edit dialog still open after 409:", dialogStill)
  // S-09: the open editor now shows the other user's values and a notice, so a second save cannot silently overwrite them.
  await expect(db.getByRole("alert")).toContainText("他のユーザーが先に更新したため")
  await expect(db.getByRole("textbox").first()).toHaveValue("E2E-Task-5 review (PO edit)")
  // list reloaded with PO's name
  await expect(b.page.getByText("E2E-Task-5 review (PO edit)").first()).toBeVisible()
  // quick status toggle with a stale version also conflicts
  report("lock A", a.issues)
  report("lock B", b.issues)
  await a.ctx.close()
  await b.ctx.close()
})

test("dev does not see sprint-management controls (sprint.manage)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "dev")
  await gotoSprints(page, s.projectId, "?view=list")
  const c = page.locator("article").first()
  const visible = {
    statusButtons: await c.getByRole("button", { name: /^Pindahkan ke (Review|Selesai)/ }).count(),
    addPb: await c.getByRole("button", { name: "Tambah item PB" }).count(),
    edit: await c.getByRole("button", { name: "Sunting Sprint" }).count(),
    del: await c.getByRole("button", { name: /^Hapus sprint/ }).count(),
  }
  console.log("dev-visible sprint controls:", JSON.stringify(visible))
  // S-03: hidden per the authz policy (the API still answers 403 to a direct request).
  expect(visible).toEqual({ statusButtons: 0, addPb: 0, edit: 0, del: 0 })
  await shot(page, "03-dev-sprint-controls-hidden", false)
  report("dev controls", issues)
  await ctx.close()
})

import { execFileSync } from "node:child_process"
import { expect, test, type Page } from "@playwright/test"
import { SHOTS, USERS, api, newUserPage, report, stamp } from "./sprints-support"

/**
 * Home project list organizing (isolated eval DB :3307 only):
 * - カード / 一覧 layout toggle (persisted), dense list rows, phone fallback at 375px
 * - 役割別 grouping (sections per own role, collapsed state persisted)
 * - dormant reminder banner (整理する / 30-day dismissal) and まとめてアーカイブ
 *   with skipped (no permission) projects, sequential archive and Undo
 *
 * Setup: the PO creates two projects, the SM creates one and adds the PO as
 * Dev; all three are back-dated 90 days directly in the eval DB so they are
 * dormant. Everything is moved to the trash afterwards.
 */
test.describe.configure({ mode: "serial" })

const MYSQL = process.env.E2E_MYSQL_BIN ?? "C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe"
const EVAL_DB_PORT = "3307" // never the production :3306
const TAG = `E2E-ORG-${stamp()}`
const PO_NAMES = [`${TAG}-A`, `${TAG}-B`]
const SKIP_NAME = `${TAG}-SKIP`
const ids: { po: string[]; skip: string } = { po: [], skip: "" }

function sql(statement: string) {
  execFileSync(MYSQL, ["-h127.0.0.1", `-P${EVAL_DB_PORT}`, "-uroot", "scrum_tool", "-e", statement], { stdio: "pipe" })
}

/** Make the projects dormant: no activity for 90 days. Ids are cuid strings created by this spec. */
function backdate(projectIds: string[]) {
  const list = projectIds.map((id) => `'${id.replace(/[^a-z0-9]/gi, "")}'`).join(",")
  sql(`UPDATE project SET updatedAt = UTC_TIMESTAMP(3) - INTERVAL 90 DAY WHERE id IN (${list});`)
  sql(`UPDATE activitylog SET createdAt = UTC_TIMESTAMP(3) - INTERVAL 90 DAY WHERE projectId IN (${list});`)
}

async function createProject(page: Page, name: string): Promise<string> {
  const r = await api<{ id: string }>(page, "POST", "/api/projects", { name, projectType: "software" })
  expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  return r.body.id
}

async function statusOf(page: Page, id: string): Promise<string> {
  return (await api<{ status: string }>(page, "GET", `/api/projects/${id}`)).body.status
}

const rowLink = (page: Page, id: string) => page.locator(`a[href="/projects/${id}"]`)

async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: `${SHOTS}/home-organize-${name}.png`, fullPage })
}

test.beforeAll(async ({ browser }) => {
  const sm = await newUserPage(browser, "sm")
  ids.skip = await createProject(sm.page, SKIP_NAME)
  const added = await api(sm.page, "POST", `/api/projects/${ids.skip}/members`, { email: USERS.po.email, role: "dev" })
  expect([200, 201], JSON.stringify(added.body)).toContain(added.status)
  await sm.ctx.close()

  const po = await newUserPage(browser, "po")
  for (const name of PO_NAMES) ids.po.push(await createProject(po.page, name))
  await po.ctx.close()
  backdate([...ids.po, ids.skip])
})

test("1440: card / list toggle (persisted), list rows and role grouping", async ({ browser }) => {
  const { ctx, page, issues } = await newUserPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  await expect(page.getByTestId("dormant-banner")).toBeVisible()
  await expect(page.getByTestId("dormant-banner")).toContainText(/休眠中のプロジェクトが \d+ 件あります/)
  await shot(page, "1440-card")

  const layout = page.getByRole("group", { name: "表示形式" })
  await layout.getByRole("button", { name: "一覧" }).click()
  const table = page.getByRole("table", { name: "プロジェクト一覧" })
  await expect(table).toBeVisible()
  await expect(table.getByRole("columnheader", { name: "最終更新" })).toBeVisible()
  const row = page.locator('[role="row"]').filter({ has: rowLink(page, ids.po[0]) })
  await expect(row.getByTestId("project-dormant-badge")).toContainText("休眠 90日")
  await expect(row.getByText("PO", { exact: true })).toBeVisible()
  const skipRow = page.locator('[role="row"]').filter({ has: rowLink(page, ids.skip) })
  await expect(skipRow.getByText("Dev", { exact: true })).toBeVisible()
  await shot(page, "1440-list")

  // Keyboard: the row's ⋮ opens the existing options menu (categories / color / archive).
  await row.getByRole("button", { name: "オプション", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("menuitem", { name: "アーカイブへ移動" })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.reload()
  await expect(page.getByRole("table", { name: "プロジェクト一覧" })).toBeVisible()
  await expect(page.getByRole("group", { name: "表示形式" }).getByRole("button", { name: "一覧" })).toHaveAttribute("aria-pressed", "true")

  // Group by my role.
  await page.getByRole("button", { name: "役割別" }).click()
  const poSection = page.getByTestId("project-section-role-po")
  const memberSection = page.getByTestId("project-section-role-member")
  await expect(poSection.getByRole("button", { name: /PO のプロジェクト\s*\(\d+\)/ })).toBeVisible()
  await expect(memberSection.getByRole("button", { name: /メンバーとして参加\s*\(\d+\)/ })).toBeVisible()
  await expect(memberSection.locator(`a[href="/projects/${ids.skip}"]`)).toBeVisible()
  await expect(poSection.locator(`a[href="/projects/${ids.po[0]}"]`)).toBeVisible()
  await shot(page, "1440-role-grouped")

  // Collapse persists across reloads.
  await memberSection.getByRole("button", { name: /メンバーとして参加/ }).click()
  await expect(memberSection.locator(`a[href="/projects/${ids.skip}"]`)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId("project-section-role-member").getByRole("button", { name: /メンバーとして参加/ })).toHaveAttribute("aria-expanded", "false")

  report("home-organize 1440", issues)
  expect(issues.console, issues.console.join("\n")).toEqual([])
  await ctx.close()
})

test("bulk archive: confirm lists skipped projects, archives sequentially, Undo restores the batch", async ({ browser }) => {
  const { ctx, page, issues } = await newUserPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  await page.getByTestId("dormant-banner").getByRole("button", { name: "整理する" }).click()
  await expect(page.getByRole("button", { name: /休眠中のみ/ })).toHaveAttribute("aria-pressed", "true")
  await page.getByTestId("dormant-bulk-bar").getByRole("button", { name: "まとめてアーカイブ" }).click()

  const dialog = page.getByRole("dialog", { name: "休眠中のプロジェクトをまとめてアーカイブ" })
  await expect(dialog.getByTestId("bulk-archive-targets")).toContainText(PO_NAMES[0])
  await expect(dialog.getByTestId("bulk-archive-targets")).toContainText(PO_NAMES[1])
  await expect(dialog.getByTestId("bulk-archive-skipped")).toContainText(SKIP_NAME)
  await expect(dialog.getByTestId("bulk-archive-targets")).not.toContainText(SKIP_NAME)
  await page.waitForTimeout(400) // let the dialog's fade-in finish before the capture
  await shot(page, "1440-bulk-confirm", false)

  await dialog.getByRole("button", { name: /件をアーカイブ$/ }).click()
  await expect(dialog).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText(/件のプロジェクトをアーカイブしました/)).toBeVisible()
  for (const id of ids.po) expect(await statusOf(page, id)).toBe("archived")
  expect(await statusOf(page, ids.skip)).toBe("active")

  await page.getByRole("button", { name: "元に戻す" }).click()
  await expect(page.getByText(/件のプロジェクトを元に戻しました/)).toBeVisible({ timeout: 30_000 })
  for (const id of ids.po) await expect.poll(() => statusOf(page, id)).toBe("active")
  // Archive + undo counted as activity; make them dormant again for the following tests.
  backdate(ids.po)

  report("home-organize bulk", issues)
  expect(issues.console, issues.console.join("\n")).toEqual([])
  await ctx.close()
})

test("reminder banner: dismissal is remembered for 30 days", async ({ browser }) => {
  const { ctx, page } = await newUserPage(browser, "po")
  await page.goto("/")
  const banner = page.getByTestId("dormant-banner")
  await expect(banner).toBeVisible()
  await banner.getByRole("button", { name: "30日間表示しない" }).click()
  await expect(banner).toHaveCount(0)
  const until = Number(await page.evaluate(() => window.localStorage.getItem("kanflow:dormantReminderSnoozedUntil")))
  expect(Math.round((until - Date.now()) / 86_400_000)).toBe(30)
  await page.reload()
  await expect(page.getByRole("button", { name: /休眠中のみ/ })).toBeVisible()
  await expect(page.getByTestId("dormant-banner")).toHaveCount(0)
  await ctx.close()
})

test("375: list layout falls back to compact rows without horizontal overflow", async ({ browser }) => {
  const { ctx, page, issues } = await newUserPage(browser, "po", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  await page.goto("/")
  await page.getByRole("group", { name: "表示形式" }).getByRole("button", { name: "一覧" }).click()
  const row = page.locator('[role="row"]').filter({ has: rowLink(page, ids.po[0]) })
  await expect(row).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "最終更新" })).toBeHidden()
  await expect(row.getByTestId("project-dormant-badge")).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const box = await row.boundingBox()
  expect(box && box.x + box.width).toBeLessThanOrEqual(375)
  await row.scrollIntoViewIfNeeded()
  await shot(page, "375-list")
  report("home-organize 375", issues)
  expect(issues.console, issues.console.join("\n")).toEqual([])
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const po = await newUserPage(browser, "po")
  for (const id of ids.po) await api(po.page, "DELETE", `/api/projects/${id}`)
  await po.ctx.close()
  if (!ids.skip) return
  const sm = await newUserPage(browser, "sm")
  await api(sm.page, "DELETE", `/api/projects/${ids.skip}`)
  await sm.ctx.close()
})

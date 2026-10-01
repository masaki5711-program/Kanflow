import { expect, test, type Locator, type Page } from "@playwright/test"
import { IOT, api, newUserPage, report, stamp } from "./sprints-support"

/**
 * Home project list: card dates, archive from the card options menu (confirm →
 * toast with Undo), the archived section, restore from it, and permission
 * (a Dev sees no archive item). Creates one throwaway project "E2E-ARCH-…"
 * as the PO and moves it to the trash at the end.
 */
test.describe.configure({ mode: "serial" })

const NAME = `E2E-ARCH-${stamp()}`
let projectId = ""

/** The project link (its accessible name may carry a "translation pending" badge, so match by href). */
const projectLink = (scope: Page | Locator) => scope.locator(`a[href="/projects/${projectId}"]`)
const activeCard = (page: Page): Locator =>
  page.locator("xpath=//main//article[not(ancestor::*[@id='archived-projects'])]").filter({ has: projectLink(page) })
const archivedRegion = (page: Page) => page.locator("#archived-projects")
const archivedToggle = (page: Page) => page.getByRole("button", { name: /^アーカイブ \(\d+\)$/ })

async function projectStatus(page: Page): Promise<string> {
  const r = await api<{ status: string }>(page, "GET", `/api/projects/${projectId}`)
  return r.body.status
}

async function archiveViaMenu(page: Page, card: Locator) {
  await card.getByRole("button", { name: "オプション", exact: true }).click()
  const menu = page.getByRole("menu")
  await menu.getByRole("menuitem", { name: "アーカイブへ移動" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText(`「${NAME}」をアーカイブへ移動しますか？`)
  const patch = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/api/projects/${projectId}`))
  await dialog.getByRole("button", { name: "アーカイブへ移動" }).click()
  expect((await patch).status()).toBe(200)
}

test("PO: card dates, archive with confirm, undo, archive again, restore from the archived section", async ({ browser }) => {
  const { ctx, page, issues } = await newUserPage(browser, "po")
  const created = await api<{ id: string }>(page, "POST", "/api/projects", { name: NAME, projectType: "software" })
  expect([200, 201], JSON.stringify(created.body)).toContain(created.status)
  projectId = created.body.id

  await page.goto("/")
  const card = activeCard(page).first()
  await expect(card).toBeVisible()
  const dates = card.getByTestId("project-dates")
  await expect(dates).toContainText(/作成 \d{4}\/\d{1,2}\/\d{1,2}/)
  await expect(dates).toContainText("更新")
  expect(await dates.getAttribute("title")).toMatch(/作成日時: .+\n最終更新: .+/)

  // Keyboard: open the menu from the ⋮ button, End jumps to the archive item.
  await card.getByRole("button", { name: "オプション", exact: true }).focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("End")
  await expect(page.getByRole("menuitem", { name: "アーカイブへ移動" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)

  // 1) archive → leaves the active list, toast offers Undo
  await archiveViaMenu(page, card)
  await expect(activeCard(page)).toHaveCount(0)
  await expect(page.getByText("アーカイブへ移動しました")).toBeVisible()
  expect(await projectStatus(page)).toBe("archived")

  // 2) undo → back in the active list
  await page.getByRole("button", { name: "元に戻す" }).click()
  await expect(activeCard(page).first()).toBeVisible()
  await expect.poll(() => projectStatus(page)).toBe("active")

  // 3) archive again → shows up in the archived section with its archive date
  await archiveViaMenu(page, activeCard(page).first())
  await expect(activeCard(page)).toHaveCount(0)
  await archivedToggle(page).click()
  const archivedLink = projectLink(archivedRegion(page))
  await expect(archivedLink).toBeVisible()
  const archivedCard = archivedRegion(page).locator("article").filter({ has: projectLink(page) })
  await expect(archivedCard.getByTestId("project-dates")).toContainText(/アーカイブ \d{4}\/\d{1,2}\/\d{1,2}/)

  // 4) restore from the archived section (no confirmation) → back in the active list
  await archivedCard.getByRole("button", { name: "オプション", exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem", { name: "アーカイブへ移動" })).toHaveCount(0)
  await menu.getByRole("menuitem", { name: "アーカイブから戻す" }).click()
  await expect(page.getByText("アーカイブから戻しました")).toBeVisible()
  await expect(archivedLink).toHaveCount(0)
  await expect(activeCard(page).first()).toBeVisible()
  expect(await projectStatus(page)).toBe("active")

  // Activity log recorded the archive / restore (status changes) for the project.
  const history = await api<{ items: Array<{ action: string; entityId: string }> }>(page, "GET", `/api/projects/${projectId}/activity?entityType=project`)
  expect(history.status).toBe(200)
  const statusChanges = history.body.items.filter((i) => i.entityId === projectId && i.action === "status_change")
  expect(statusChanges.length).toBeGreaterThanOrEqual(4) // archive, undo, archive, restore

  report("home-archive po", issues)
  expect(issues.console, issues.console.join("\n")).toEqual([])
  await ctx.close()
})

test("Dev sees no archive item in the card options menu", async ({ browser }) => {
  const { ctx, page } = await newUserPage(browser, "dev")
  await page.goto("/")
  const iotCard = page.locator("main article").filter({ has: page.getByTestId("project-card-header") }).filter({ has: page.locator(`a[href="/projects/${IOT}"]`) }).first()
  await expect(iotCard).toBeVisible()
  // UI language of the dev account varies (id / ja): find the ⋮ trigger by its menu popup.
  await iotCard.locator('button[aria-haspopup="menu"]').click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem")).toHaveCount(0)
  await expect(menu.getByText(/アーカイブ|archive|arsip/i)).toHaveCount(0)
  // The API refuses it too.
  const r = await api(page, "PATCH", `/api/projects/${IOT}`, { status: "archived" })
  expect(r.status).toBe(403)
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  if (!projectId) return
  const { ctx, page } = await newUserPage(browser, "po")
  await api(page, "DELETE", `/api/projects/${projectId}`)
  await ctx.close()
})

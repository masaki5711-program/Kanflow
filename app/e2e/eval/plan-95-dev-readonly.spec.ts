import { expect, test } from "@playwright/test"
import { PROJECT, SHOTS, api, bar, createItem, deleteItem, getPlan, gotoPlan, nameBtn, report, row, stamp, userPage, type Item } from "./plan-support"

/** e2e-dev (Developer, UI language id): read-only master plan. */

let s = ""
let root: Item, leaf: Item

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  s = stamp()
  root = await createItem(page, { name: `E2E-V${s} root`, plannedStart: "2026-10-01", plannedEnd: "2026-10-07" })
  leaf = await createItem(page, { name: `E2E-V${s} leaf`, parentId: root.id, plannedStart: "2026-10-01", plannedEnd: "2026-10-07" })
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  await deleteItem(page, root.id)
  await ctx.close()
})

test("dev sees a read-only plan (no add/drag/menu edits, read-only editor)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "dev", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  const initialLang = await page.locator("header select").first().inputValue()
  console.log("dev initial UI language:", initialLang)
  if (initialLang !== "id") await page.locator("header select").first().selectOption("id")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Rencana Induk/)
  await expect(page.getByRole("button", { name: "Tambah item" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Tambah tonggak" })).toHaveCount(0)
  await expect(page.locator("[data-plan-handle]")).toHaveCount(0)
  await expect(page.locator("[data-plan-resize]")).toHaveCount(0)
  await expect(row(page, leaf.id).getByRole("cell").first()).toHaveText("1–7 Okt")
  await page.screenshot({ path: `${SHOTS}/97-dev-readonly.png` })
  // More menu: no baseline entries
  await page.getByRole("button", { name: "Tindakan lain" }).click()
  const more = await page.getByRole("menu").getByRole("menuitem").allInnerTexts()
  console.log("dev more menu:", JSON.stringify(more))
  expect(more.join("|")).not.toMatch(/garis dasar/i)
  await page.keyboard.press("Escape")
  // Row menu: only edit/view entry
  await row(page, leaf.id).hover()
  await page.getByRole("button", { name: `Tindakan untuk E2E-V${s} leaf` }).click()
  const rowMenu = await page.getByRole("menu").getByRole("menuitem").allInnerTexts()
  console.log("dev row menu:", JSON.stringify(rowMenu))
  expect(rowMenu.length).toBe(1)
  await page.keyboard.press("Escape")
  // Drag does nothing
  const before = (await getPlan(page)).items.find((i) => i.id === leaf.id)!
  const bb = (await bar(page, leaf.id).boundingBox())!
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2, { steps: 6 })
  await page.mouse.up()
  await bar(page, leaf.id).focus()
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(1000)
  const after = (await getPlan(page)).items.find((i) => i.id === leaf.id)!
  expect(after.plannedStart).toBe(before.plannedStart)
  // F2 / dblclick does not rename
  await nameBtn(page, leaf.id).dblclick()
  await expect(page.getByRole("textbox", { name: /Ganti nama/ })).toHaveCount(0)
  // Editor read-only
  await page.keyboard.press("Escape")
  await bar(page, leaf.id).focus()
  await page.keyboard.press("Enter")
  const d = page.getByRole("dialog")
  await expect(d).toBeVisible()
  const disabledName = await d.locator("input").first().isDisabled()
  const buttons = await d.getByRole("button").allInnerTexts()
  console.log("dev editor: name disabled =", disabledName, "buttons =", JSON.stringify(buttons))
  expect(disabledName).toBe(true)
  expect(buttons.join("|")).not.toMatch(/Simpan|Hapus/)
  await page.screenshot({ path: `${SHOTS}/98-dev-editor.png`, fullPage: true })
  await page.keyboard.press("Escape")
  // API is protected too
  const r = await api(page, "PATCH", `/api/projects/${PROJECT}/plan/${leaf.id}`, { name: "hacked", version: after.version })
  const c = await api(page, "POST", `/api/projects/${PROJECT}/plan`, { name: "E2E-hack", plannedStart: "2026-10-01", plannedEnd: "2026-10-02" })
  const b = await api(page, "POST", `/api/projects/${PROJECT}/plan/baseline`, {})
  console.log("dev PATCH/POST/baseline status:", r.status, c.status, b.status)
  expect(r.status).toBe(403)
  expect(c.status).toBe(403)
  expect(b.status).toBe(403)
  // Export allowed
  const x = await page.request.get(`${process.env.E2E_BASE_URL ?? "http://localhost:3104"}/api/projects/${PROJECT}/plan/export?lang=id`)
  console.log("dev export status:", x.status())
  report("dev readonly", issues)
  await ctx.close()
})

test("dev on 375px (id)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "dev", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto(`/projects/${PROJECT}/plan`)
  await expect(page.locator("[data-plan-chart]")).toBeAttached({ timeout: 30_000 })
  await page.waitForTimeout(800)
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox()
  console.log("dev 375 h1 box:", JSON.stringify(h1))
  await page.screenshot({ path: `${SHOTS}/99-dev-375-id.png`, fullPage: true })
  // Same page in ja (short toolbar labels): does the header still wrap?
  // Below lg the display-language select lives in the user menu (avatar button).
  await page.getByRole("button", { name: /^(ユーザーメニュー|User menu|Menu pengguna)/ }).click()
  const lang = page.locator("header select:visible").first()
  await lang.selectOption("ja")
  await expect(page.locator("h1")).toHaveText("全体計画")
  await page.waitForTimeout(500)
  const h1ja = await page.locator("h1").boundingBox()
  console.log("dev 375 ja h1 box:", JSON.stringify(h1ja))
  await page.screenshot({ path: `${SHOTS}/99-dev-375-ja-header.png` })
  await lang.selectOption("id")
  await expect(page.locator("h1")).toHaveText("Rencana Induk")
  expect(h1ja!.width, "title squeezed to one character column").toBeGreaterThan(100)
  report("dev 375", issues)
  await ctx.close()
})

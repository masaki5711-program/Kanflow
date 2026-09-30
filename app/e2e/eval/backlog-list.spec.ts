import { expect, test } from "@playwright/test"
import { BACKLOG, gotoBacklog, login, report, SHOTS, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })

test("facet filters write URL state and survive reload", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const rows = page.locator("[data-dnd-row]")
  const total = await rows.count()

  // text search -> ?q
  await page.getByRole("searchbox", { name: "バックログを検索" }).fill("OLE")
  await expect(page).toHaveURL(/[?&]q=OLE/)
  await expect(page.getByText(/\d+ \/ \d+ 件を表示中/)).toBeVisible()
  const withQ = await rows.count()
  expect(withQ).toBeLessThan(total)
  await page.reload()
  await expect(page.getByRole("searchbox", { name: "バックログを検索" })).toHaveValue("OLE")
  await expect(rows).toHaveCount(withQ)

  // status facet
  await page.getByRole("combobox", { name: "状態" }).selectOption("ready")
  await expect(page).toHaveURL(/status=ready/)
  await expect(page.getByRole("region", { name: "Not Ready（未準備）" })).toHaveCount(0)

  // clear
  await page.getByRole("button", { name: "絞り込みを解除" }).click()
  await expect(page).not.toHaveURL(/q=|status=/)

  // points facet
  await page.getByRole("combobox", { name: "工数" }).selectOption("5")
  await expect(page).toHaveURL(/points=5/)
  for (const txt of await page.locator("[data-dnd-row]").allInnerTexts()) expect(txt).toMatch(/5/)
  // goal "not set"
  await page.getByRole("combobox", { name: "プロダクトゴール" }).selectOption("__none")
  await expect(page).toHaveURL(/goal=__none/)
  await page.screenshot({ path: `${SHOTS}/backlog-filters.png`, fullPage: true })
  await page.getByRole("button", { name: "絞り込みを解除" }).click()

  // epic facet via URL
  await page.goto(`${BACKLOG}?epic=${encodeURIComponent("PFS Infrastructure Setup")}&showDone=1`)
  await expect(page.getByRole("combobox", { name: "エピック" })).toHaveValue("PFS Infrastructure Setup")
  // po facet via URL
  await page.goto(`${BACKLOG}?po=__none`)
  await expect(page.getByRole("combobox", { name: "プロダクトオーナー" })).toHaveValue("__none")
  // invalid values are ignored
  await page.goto(`${BACKLOG}?status=bogus&points=abc`)
  await expect(page.getByRole("combobox", { name: "状態" })).toHaveValue("")
  // unknown plan id -> chip with "…"
  await page.goto(`${BACKLOG}?plan=doesnotexist`)
  await page.waitForLoadState("networkidle")
  await expect(page.locator("[data-dnd-row]")).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/backlog-plan-unknown.png`, fullPage: true })
  const planChip = page.getByRole("button", { name: /全体計画/ })
  console.log("plan chip count", await planChip.count(), await planChip.allInnerTexts())
  report("filters", issues)
})

test("filter changes replace history (no entry per change)", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const before = await page.evaluate(() => history.length)
  await page.getByRole("combobox", { name: "状態" }).selectOption("not_ready")
  await expect(page).toHaveURL(/status=not_ready/)
  await page.getByRole("combobox", { name: "工数" }).selectOption({ index: 1 })
  await expect(page).toHaveURL(/points=/)
  expect(await page.evaluate(() => history.length)).toBe(before)
})

test("done section toggle and paging", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const toggle = page.getByRole("button", { name: /完了済みを表示/ })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  await expect(page).toHaveURL(/showDone=1/)
  const done = page.getByRole("region", { name: "完了" })
  await expect(done).toBeVisible()
  await expect(done.getByText(/新しい順に 20 \/ \d+ 件を表示/)).toBeVisible()
  const more = done.getByRole("button", { name: /もっと見る（残り \d+ 件）/ })
  await expect(more).toBeVisible()
  await more.click()
  await expect(done.getByText(/新しい順に (\d+) \/ \1 件を表示/)).toBeVisible()
  await expect(more).toHaveCount(0)
  // completed rows: no drag handle, no delete
  await expect(done.locator("button[data-drag-handle]")).toHaveCount(0)
  await expect(done.getByRole("button", { name: "削除" })).toHaveCount(0)
  await expect(done.getByRole("button", { name: "着手可能に戻す" }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/backlog-done.png`, fullPage: true })
  await page.reload()
  await expect(page.getByRole("button", { name: /完了済みを非表示/ })).toHaveAttribute("aria-expanded", "true")
  report("done", issues)
})

test("keyboard shortcuts and sidebar grouping", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await page.goto(`/projects/cmr8tnrzm0000m09lghm5jshr`)
  await page.waitForLoadState("networkidle")
  await page.locator("body").click({ position: { x: 5, y: 400 } })
  await page.keyboard.press("?")
  const help = page.getByRole("dialog", { name: "キーボードショートカット" })
  await expect(help).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/shortcuts-help.png` })
  await page.keyboard.press("Escape")
  await expect(help).toHaveCount(0)
  await page.keyboard.press("g")
  await page.keyboard.press("b")
  await expect(page).toHaveURL(/\/backlog/)
  await expect(page.locator("[data-dnd-row]").first()).toBeVisible()
  await page.locator("h1").click()
  await page.keyboard.press("/")
  await page.waitForTimeout(500)
  const search = page.getByRole("dialog", { name: "検索とコマンド" })
  const searchVisible = await search.isVisible().catch(() => false)
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))
  console.log("after slash: dialog", searchVisible, "focused", focusedLabel)
  await page.keyboard.press("Escape")
  // shortcuts must not fire while typing
  const box = page.getByRole("searchbox", { name: "バックログを検索" })
  await box.fill("")
  await box.pressSequentially("g?")
  await expect(page.getByRole("dialog", { name: "キーボードショートカット" })).toHaveCount(0)
  await box.fill("")

  // sidebar collapse
  const nav = page.getByRole("navigation", { name: "プロジェクトメニュー" })
  const grp = nav.getByRole("button", { name: "計画" })
  await expect(grp).toHaveAttribute("aria-expanded", "true")
  await grp.click()
  await expect(grp).toHaveAttribute("aria-expanded", "false")
  await expect(nav.getByRole("link", { name: "全体計画" })).toBeHidden()
  await page.reload()
  const persisted = await nav.getByRole("button", { name: "計画" }).getAttribute("aria-expanded")
  console.log("sidebar collapse persisted after reload:", persisted)
  await page.screenshot({ path: `${SHOTS}/sidebar-collapsed.png` })
  if (persisted === "false") await nav.getByRole("button", { name: "計画" }).click()
  report("shortcuts", issues)
})

test("permissions: SM / Dev / section manager", async ({ browser }) => {
  for (const role of ["sm", "dev", "sec"] as const) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const issues = watch(page)
    await login(page, role)
    await page.goto(BACKLOG)
    await expect(page.locator("[data-dnd-row]").first()).toBeVisible({ timeout: 30_000 })
    const main = page.getByRole("main")
    const first = main.locator("[data-dnd-row]").first()
    const facts = {
      dragHandles: await page.locator("button[data-drag-handle]").count(),
      trash: await main.locator("[data-dnd-row]").getByRole("button", { name: /^(削除|Hapus)$/ }).count(),
      menu: await page.locator("[data-dnd-row] button[aria-haspopup=menu]").count(),
      addPbi: await main.getByRole("button", { name: /PBI追加|Tambah PBI/ }).count(),
      select: await main.getByRole("button", { name: /^(選択|Pilih)$/ }).count(),
      firstRowButtons: await first.getByRole("button").allInnerTexts(),
      firstRowLabels: await first.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? "")),
      importBtn: await main.getByRole("button", { name: /Excel/ }).count(),
      exportLink: await main.getByRole("link", { name: /Excel/ }).count(),
      h1s: await page.locator("h1").evaluateAll((els) => els.map((e) => `${e.textContent} visible=${(e as HTMLElement).offsetParent !== null}`)),
    }
    console.log(role, JSON.stringify(facts))
    await page.screenshot({ path: `${SHOTS}/backlog-${role}.png`, fullPage: true })
    await page.locator("[data-dnd-row] h3 button").first().click()
    const dlg = page.getByRole("dialog")
    await expect(dlg).toBeVisible()
    await page.waitForTimeout(800)
    console.log(role, "modal footer buttons", await dlg.getByRole("contentinfo").getByRole("button").allInnerTexts())
    report(`perm-${role}`, issues)
    await ctx.close()
  }
})

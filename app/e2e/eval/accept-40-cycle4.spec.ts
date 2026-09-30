import { expect, test } from "@playwright/test"
import * as fs from "node:fs"
import { open, snap, visit, flushErrs, overflow, PILOT, OUT } from "./accept-helpers"

/**
 * Acceptance cycle 4 — verification of the A3 fixes that the cycle-3 specs do
 * not cover, plus quick persona walkthroughs at 1440 and 375.
 * Only "A3-03 comment write" writes (one short comment; ACC_WRITE=1).
 */
test.describe.configure({ mode: "serial" })
test.setTimeout(240_000)

const P = `/projects/${PILOT}`
const PBI238 = "cmuo3il850042a89luwvwguan"
const ACC = process.env.ACC_PROJECT
  ?? (fs.existsSync(`${OUT}/acc-project.txt`) ? fs.readFileSync(`${OUT}/acc-project.txt`, "utf8").trim() : "")

test("A3-03 comment write (PO ja, one short comment with mention)", async ({ browser }) => {
  test.skip(process.env.ACC_WRITE !== "1", "set ACC_WRITE=1 (one comment; one background translation)")
  const s = await open(browser, "po", { lang: "ja", logFile: "c4.log" })
  const { page } = s
  await visit(s, `${P}/backlog?pbi=${PBI238}&tab=comments`, "pbi238 comments")
  const detail = page.getByRole("dialog")
  const box = detail.getByRole("textbox", { name: "新しいコメント" })
  await box.click()
  await box.pressSequentially("E2E-ACC4 明日までに確認して @E2E D", { delay: 30 })
  await expect(page.getByRole("listbox")).toContainText("E2E Dev")
  await page.keyboard.press("Enter")
  s.log(`textarea after mention: ${await box.inputValue()}`)
  await snap(s, "c4-po-comment-compose")
  const t0 = Date.now()
  await detail.getByRole("button", { name: "送信" }).click()
  await expect(detail.getByText(/E2E-ACC4 明日までに確認して/)).toBeVisible()
  s.log(`comment posted in ${Date.now() - t0} ms; toasts: ${(await page.locator("[role=status]").allInnerTexts()).join(" | ")}`)
  await snap(s, "c4-po-comment-posted")
  flushErrs(s, "po comment")
  await s.ctx.close()
})

test("A3-03/A3-08 dev (id) sees translated comment + notification tabs", async ({ browser }) => {
  const s = await open(browser, "dev", { lang: "id", logFile: "c4.log" })
  const { page } = s
  await visit(s, "/", "home")
  const bell = page.getByRole("button", { name: /^Notifikasi/ }).first()
  s.log(`bell: ${await bell.getAttribute("aria-label")}`)
  await bell.click()
  const dlg = page.getByRole("dialog", { name: "Notifikasi" })
  const tabs = await dlg.getByRole("tab").allInnerTexts()
  s.log(`notification tabs: ${tabs.join(" | ")}`)
  await snap(s, "c4-dev-notif-all")
  await dlg.getByRole("tab").nth(1).click()
  await page.waitForTimeout(800)
  const items = await dlg.getByRole("listitem").allInnerTexts()
  s.log(`personal tab items (${items.length}): ${items.slice(0, 6).map((t) => t.replace(/\n/g, " / ")).join(" || ")}`)
  await snap(s, "c4-dev-notif-personal")
  await visit(s, `${P}/backlog?pbi=${PBI238}&tab=comments`, "pbi238 comments (id)")
  const panel = page.getByRole("tabpanel")
  await expect(panel.getByRole("listitem").first()).toBeVisible()
  const comments = await panel.getByRole("listitem").allInnerTexts()
  s.log(`comments in id UI: ${comments.map((t) => t.replace(/\n/g, " / ")).join(" || ")}`)
  await snap(s, "c4-dev-comments-id")
  const toggle = panel.getByRole("button", { name: /Teks asli/ }).first()
  if (await toggle.count()) {
    await toggle.click()
    await snap(s, "c4-dev-comments-original")
  }
  flushErrs(s, "dev comments")
  await s.ctx.close()
})

test("dev (id) board + burndown at 1440 and 375", async ({ browser }) => {
  for (const width of [1440, 375]) {
    const s = await open(browser, "dev", { width, height: width === 375 ? 812 : 900, lang: "id", logFile: "c4.log" })
    const { page } = s
    await visit(s, "/", `home@${width}`)
    await snap(s, `c4-dev-home-${width}`)
    if (ACC) {
      await visit(s, `${ACC}/sprints?view=board`, `acc board@${width}`)
      const first = page.getByRole("region", { name: /Papan kanban/ }).getByRole("listitem").first()
      await expect(first).toBeVisible()
      const y = await first.evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY))
      s.log(`first board card at y=${y}px (@${width}) overflow=${await overflow(s)}`)
      await snap(s, `c4-dev-board-${width}`, width === 375)
      await visit(s, `${ACC}/burndown`, `acc burndown@${width}`)
      await snap(s, `c4-dev-burndown-${width}`)
    }
    await visit(s, `${P}/burndown`, `pilot burndown@${width}`)
    await snap(s, `c4-dev-burndown-pilot-${width}`, true)
    await visit(s, P, `pilot dash@${width}`)
    await snap(s, `c4-dev-dash-${width}`, true)
    flushErrs(s, `dev ${width}`)
    await s.ctx.close()
  }
})

test("PO (ja) home, dashboard, backlog, plan, sprints at 1440 and 375", async ({ browser }) => {
  for (const width of [1440, 375]) {
    const s = await open(browser, "po", { width, height: width === 375 ? 812 : 900, lang: "ja", logFile: "c4.log" })
    const { page } = s
    for (const [name, url] of [["home", "/"], ["dash", P], ["backlog", `${P}/backlog`], ["plan", `${P}/plan`], ["sprints", `${P}/sprints`], ["settings", `${P}/settings`], ["guide", `${P}/guide`]] as const) {
      await visit(s, url, `${name}@${width}`)
      await page.waitForTimeout(500)
      await snap(s, `c4-po-${name}-${width}`, name === "dash" || name === "home")
    }
    if (width === 1440) {
      await visit(s, `${P}/plan`, "plan link picker")
      const rowMenu = page.getByRole("button", { name: / の操作$/ }).first()
      await rowMenu.click()
      const items = await page.getByRole("menuitem").allInnerTexts()
      s.log(`po plan row menu: ${items.join(", ")}`)
      const link = page.getByRole("menuitem", { name: /PBIをリンク/ })
      if (await link.count()) {
        await link.click()
        await page.waitForTimeout(600)
        const opts = await page.getByRole("dialog").getByRole("checkbox").evaluateAll((els) => els.slice(0, 12).map((e) => (e.closest("label")?.textContent ?? e.getAttribute("aria-label") ?? "").trim()))
        s.log(`link picker first options: ${opts.join(" | ")}`)
        await snap(s, "c4-po-plan-link-picker")
        await page.keyboard.press("Escape")
      }
    }
    flushErrs(s, `po ${width}`)
    await s.ctx.close()
  }
})

test("section manager (ja) portfolio + dashboard + plan at 1440 and 375", async ({ browser }) => {
  for (const width of [1440, 375]) {
    const s = await open(browser, "sec", { width, height: width === 375 ? 812 : 900, lang: "ja", logFile: "c4.log" })
    const { page } = s
    await visit(s, "/portfolio", `portfolio@${width}`)
    await snap(s, `c4-sec-portfolio-${width}`, true)
    s.log(`portfolio overflow=${await overflow(s)} @${width}`)
    if (width === 1440) {
      const hdr = page.getByRole("columnheader", { name: "期限切れ" }).getByRole("button")
      await hdr.click()
      await page.waitForTimeout(500)
      s.log(`overdue sort 1st click -> ${page.url()} aria-sort=${await page.getByRole("columnheader", { name: /期限切れ/ }).getAttribute("aria-sort")}`)
    }
    await visit(s, P, `sec dash@${width}`)
    await snap(s, `c4-sec-dash-${width}`, true)
    await visit(s, `${P}/plan`, `sec plan@${width}`)
    await snap(s, `c4-sec-plan-${width}`)
    flushErrs(s, `sec ${width}`)
    await s.ctx.close()
  }
})

test("admin (ja) users, metrics, tokens at 1440 and 375 + validation", async ({ browser }) => {
  for (const width of [1440, 375]) {
    const s = await open(browser, "admin", { width, height: width === 375 ? 812 : 900, lang: "ja", logFile: "c4.log" })
    const { page } = s
    for (const [name, url] of [["users", "/admin/users"], ["metrics", "/admin/metrics"], ["tokens", "/admin/api-tokens"], ["trash", "/admin/trash"]] as const) {
      await visit(s, url, `${name}@${width}`)
      await page.waitForTimeout(400)
      s.log(`admin ${name} overflow=${await overflow(s)} @${width}`)
      await snap(s, `c4-admin-${name}-${width}`)
    }
    if (width === 1440) {
      await visit(s, "/admin/users", "users validation")
      await page.getByRole("button", { name: "ユーザー追加" }).click()
      const d = page.getByRole("dialog")
      await d.getByRole("textbox", { name: /名前/ }).fill("E2E-ACC4 検証")
      await d.getByRole("textbox", { name: /メール/ }).fill("not-an-email")
      await d.getByRole("textbox", { name: /初期パスワード/ }).fill("abc12")
      await d.getByRole("button", { name: "作成" }).click()
      await page.waitForTimeout(500)
      s.log(`user form errors: ${(await d.innerText()).replace(/\n/g, " / ").slice(0, 400)}`)
      await snap(s, "c4-admin-user-validation")
      await page.keyboard.press("Escape")
      const discard = page.getByRole("alertdialog").getByRole("button", { name: "破棄して閉じる" })
      if (await discard.count()) await discard.click()
    }
    flushErrs(s, `admin ${width}`)
    await s.ctx.close()
  }
})

test("PO plan link picker on a leaf row (read-only: dialog opened and closed)", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: "c4.log" })
  const { page } = s
  await visit(s, `${P}/plan`, "plan")
  const menus = page.getByRole("button", { name: / の操作$/ })
  await menus.nth(2).click()
  s.log(`leaf row menu: ${(await page.getByRole("menuitem").allInnerTexts()).join(", ")}`)
  const link = page.getByRole("menuitem", { name: /PBI.*リンク/ })
  if (await link.count()) {
    await link.click()
    await page.waitForTimeout(1000)
    const dlg = page.getByRole("dialog")
    const labels = await dlg.locator("label:has(input[type=checkbox])").allInnerTexts()
    s.log(`link picker (${labels.length}): ${labels.slice(0, 10).map((l) => l.replace(/\n/g, " ")).join(" | ")}`)
    await snap(s, "c4-po-plan-link-picker")
  }
  flushErrs(s, "po plan link")
  await s.ctx.close()
})

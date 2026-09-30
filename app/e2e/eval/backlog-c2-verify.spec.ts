import { expect, test, type Page } from "@playwright/test"
import ExcelJS from "exceljs"
import { api, BACKLOG, gotoBacklog, login, newUserPage, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

/** Cycle 2: re-verification of backlog cycle-1 findings F-01, F-03, F-08, F-09, F-11, F-13 and the conflict notice. */
test.describe.configure({ mode: "serial" })

async function mkPbi(page: Page, tag: string, extra: Record<string, unknown> = {}) {
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として、cycle2 を確認したい。", workloadScore: 1, ...extra })
  expect(r.status).toBe(201)
  return (r.body.data ?? r.body) as { id: string; displayId: number }
}
const del = (page: Page, id: string) => api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${id}`)

test("F-01 create: 追加 disabled while empty; API rejects untitled PBIs", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  const dlg = page.getByRole("dialog", { name: "PBI追加" })
  const add = dlg.getByRole("button", { name: "追加" })
  await expect(add).toBeDisabled()
  console.log("hint:", await dlg.getByRole("contentinfo").innerText().catch(() => "?"))
  // whitespace only + another field → inline error, still disabled
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("memo only")
  await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill("   ")
  await page.waitForTimeout(300)
  console.log("inline alert:", await dlg.getByRole("alert").allInnerTexts(), "disabled", await add.isDisabled())
  await page.screenshot({ path: `${SHOTS}/c2-create-empty.png` })
  await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill("E2E-C2-CREATE")
  await expect(add).toBeEnabled()
  // do not create: cancel (guard) → discard
  await dlg.getByRole("button", { name: "キャンセル" }).click()
  const discard = page.getByRole("button", { name: /破棄/ })
  if (await discard.isVisible().catch(() => false)) await discard.click()
  // API
  for (const body of [{}, { initiative: "  ", userStory: "" }, { poNote: "x" }]) {
    const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, body)
    console.log("POST", JSON.stringify(body), "->", r.status, JSON.stringify(r.body).slice(0, 200))
    expect(r.status).toBe(400)
  }
  // PATCH that blanks both fields of an existing PBI
  const p = await mkPbi(page, `E2E-C2-BLANK-${stamp()}`)
  const pr = await api(page, "PATCH", `/api/projects/${PROJECT}/backlog/${p.id}`, { initiative: "", userStory: "", version: 0 })
  console.log("PATCH blank both ->", pr.status, JSON.stringify(pr.body).slice(0, 200))
  await del(page, p.id)
  report("c2-f01", issues)
})

test("F-03 / F-11 bulk bar: link plan, PO list = POs, clear asks first", async ({ page }) => {
  const issues = watch(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-C2BULK-${stamp()}`
  const a = await mkPbi(page, `${tag}-a`)
  const b = await mkPbi(page, `${tag}-b`)
  await page.goto(`${BACKLOG}?q=${tag}`)
  await expect(page.locator("[data-dnd-row]")).toHaveCount(2)
  await page.getByRole("main").getByRole("button", { name: "選択" }).click()
  for (const row of await page.locator("[data-dnd-row]").all()) await row.getByRole("checkbox").first().check()
  const bar = page.getByRole("region", { name: /一括/ }).or(page.getByRole("toolbar")).first()
  await expect(bar).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/c2-bulk-bar-1280.png` })
  const planSel = page.getByRole("combobox", { name: /全体計画/ })
  const planOpts = await planSel.locator("option").allInnerTexts()
  console.log("plan options", planOpts.length, planOpts.slice(0, 6), "…", planOpts.slice(-2))
  const values = await planSel.locator("option").evaluateAll((els) => els.filter((e) => !(e as HTMLOptionElement).disabled).map((e) => (e as HTMLOptionElement).value))
  const leaf = values.find((v) => v && v !== "__clear")
  expect(leaf).toBeTruthy()
  await planSel.selectOption(leaf!)
  const bulkReq = page.waitForResponse((r) => r.url().includes("/backlog/bulk"))
  await page.getByRole("button", { name: "全体計画にリンク" }).click()
  const res = await bulkReq
  console.log("bulk linkPlan", res.status(), (await res.text()).slice(0, 200))
  await page.waitForTimeout(800)
  const pa = (await api(page, "GET", `/api/projects/${PROJECT}/backlog/${a.id}`)).body
  console.log("a.planItemId", ((pa.data ?? pa) as Record<string, unknown>).planItemId)
  // Unlink asks first (selection mode may have ended)
  console.log("after apply: selection text", await page.getByText(/件選択中/).first().innerText().catch(() => "?"))
  if (!(await planSel.isVisible().catch(() => false))) await page.getByRole("main").getByRole("button", { name: "選択" }).click().catch(() => undefined)
  for (const row of await page.locator("[data-dnd-row]").all()) await row.getByRole("checkbox").first().check()
  await planSel.selectOption("__clear")
  await page.getByRole("button", { name: "全体計画にリンク" }).click()
  const confirmDlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).last()
  console.log("unlink confirm:", (await confirmDlg.innerText().catch(() => "none")).slice(0, 200))
  await page.getByRole("button", { name: "キャンセル" }).last().click().catch(() => undefined)
  for (const row of await page.locator("[data-dnd-row]").all()) await row.getByRole("checkbox").first().check()
  // PO select
  const poSel = page.getByRole("region", { name: "一括操作" }).getByRole("combobox", { name: "プロダクトオーナー" })
  console.log("PO options", await poSel.locator("option").allInnerTexts())
  console.log("PO button disabled with default:", await page.getByRole("button", { name: /を割り当て/ }).isDisabled())
  await poSel.selectOption("__clear")
  await page.getByRole("button", { name: /を割り当て/ }).click()
  console.log("PO clear confirm:", (await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().innerText().catch(() => "none")).slice(0, 200))
  await page.getByRole("button", { name: "キャンセル" }).last().click().catch(() => undefined)
  // bar layout at 768
  await page.setViewportSize({ width: 768, height: 900 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/c2-bulk-bar-768.png` })
  await page.setViewportSize({ width: 375, height: 800 })
  await page.waitForTimeout(300)
  console.log("375 bulk: scrollWidth", await page.evaluate(() => document.documentElement.scrollWidth))
  await page.screenshot({ path: `${SHOTS}/c2-bulk-bar-375.png`, fullPage: true })
  await del(page, a.id)
  await del(page, b.id)
  report("c2-bulk", issues)
})

test("F-08 mention listbox visible above the footer; Enter before suggestions load", async ({ page }) => {
  const issues = watch(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-C2MENT-${stamp()}`
  const p = await mkPbi(page, tag)
  await page.goto(`${BACKLOG}?pbi=${p.displayId}&tab=comments`)
  const dlg = page.getByRole("dialog", { name: tag })
  await expect(dlg.getByRole("tab", { name: /コメント/, selected: true })).toBeVisible()
  const box = dlg.getByRole("textbox", { name: "新しいコメント" })
  await box.pressSequentially("@E2E")
  const lb = page.getByRole("listbox", { name: "メンション候補" })
  await expect(lb).toBeVisible()
  const opts = lb.getByRole("option")
  const n = await opts.count()
  const cover: string[] = []
  for (let i = 0; i < n; i++) {
    const o = opts.nth(i)
    const bb = await o.boundingBox()
    if (!bb) { cover.push(`${i}:nobox`); continue }
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el ? (el.closest("[role=option]") ? "option" : `${el.tagName}.${(el as HTMLElement).className?.toString().slice(0, 40)}`) : "none"
    }, [bb.x + bb.width / 2, bb.y + bb.height / 2])
    cover.push(`${(await o.innerText()).replace(/\s+/g, " ")}=${hit}`)
  }
  console.log("F-08 options", n, cover)
  // The author (e2e-po) is not offered (cycle 2).
  await expect(lb.getByRole("option", { name: "@E2E PO" })).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/c2-mention-listbox.png` })
  await page.keyboard.press("Escape")
  await box.fill("")
  // race: type and press Enter immediately
  await box.focus()
  await page.keyboard.type("@E2E S", { delay: 0 })
  await page.keyboard.press("Enter")
  await page.waitForTimeout(800)
  console.log("F-08 race value:", JSON.stringify(await box.inputValue()))
  // Fixed (cycle 2): Enter on the open @token inserts the mention, never a newline.
  // Cycle 4 (A3-20): the text area shows "@Name"; the "@[Name]" token is only the stored form.
  await expect(box).toHaveValue("@E2E SM ")
  await box.fill("")
  await del(page, p.id)
  report("c2-mention", issues)
})

test("F-09 export follows the filters (file content)", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page, "?status=ready")
  const link = page.getByRole("main").getByRole("link", { name: /Excel/ })
  const href = await link.getAttribute("href")
  console.log("href", href, "title", await link.getAttribute("title"))
  const res = await page.request.get(href!)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await res.body()) as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  const rows = ws.actualRowCount - 1
  const statusCol = (ws.getRow(1).values as unknown[]).indexOf("ステータス")
  const statuses = new Set<string>()
  ws.eachRow((r, i) => { if (i > 1) statuses.add(String(r.getCell(statusCol).value)) })
  const shown = await page.locator("[data-dnd-row]").count()
  console.log("F-09 sheet", ws.name, "rows", rows, "statuses", [...statuses], "cards shown", shown)
  // with a text query too
  await page.goto(`${BACKLOG}?q=PFE`)
  await page.waitForLoadState("networkidle")
  const href2 = await page.getByRole("main").getByRole("link", { name: /Excel/ }).getAttribute("href")
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load((await (await page.request.get(href2!)).body()) as unknown as ArrayBuffer)
  console.log("F-09 q=PFE href", href2, "rows", wb2.worksheets[0].actualRowCount - 1, "result line", await page.getByText(/件を表示中/).first().innerText().catch(() => "?"))
  report("c2-export", issues)
})

test("conflict notice: 自分の入力に戻す restores my input and saves over the new version", async ({ browser }) => {
  const a = await newUserPage(browser, "po")
  const b = await newUserPage(browser, "sm")
  await gotoBacklog(a.page)
  const tag = `E2E-C2LOCK-${stamp()}`
  const pbi = await mkPbi(a.page, tag)
  for (const u of [a, b]) {
    await u.page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
    await u.page.getByRole("dialog", { name: tag }).getByRole("button", { name: "編集" }).click()
  }
  await a.page.getByRole("dialog").getByRole("textbox", { name: "PO メモ" }).fill("A wins")
  await a.page.getByRole("dialog").getByRole("button", { name: "更新" }).click()
  await expect(a.page.getByText("PBI を保存しました")).toBeVisible()
  const dlg = b.page.getByRole("dialog", { name: tag })
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("B typed this")
  await dlg.getByRole("textbox", { name: "エピック" }).fill("B-epic")
  await dlg.getByRole("button", { name: "更新" }).click()
  const notice = dlg.getByRole("alert").filter({ hasText: "自分の入力に戻す" })
  await expect(notice).toBeVisible()
  console.log("notice:", (await notice.innerText()).replace(/\n+/g, " | "))
  console.log("memo after conflict:", await dlg.getByRole("textbox", { name: "PO メモ" }).inputValue())
  await b.page.screenshot({ path: `${SHOTS}/c2-conflict-notice.png` })
  await notice.getByRole("button", { name: "自分の入力に戻す" }).click()
  const memo = await dlg.getByRole("textbox", { name: "PO メモ" }).inputValue()
  const epic = await dlg.getByRole("textbox", { name: "エピック" }).inputValue()
  console.log("after restore: memo", memo, "epic", epic, "notice visible", await notice.isVisible())
  expect(memo).toBe("B typed this")
  const patch = b.page.waitForResponse((r) => r.request().method() === "PATCH")
  await dlg.getByRole("button", { name: "更新" }).click()
  const pr = await patch
  console.log("second save", pr.status(), pr.request().postData())
  expect(pr.status()).toBe(200)
  const final = (await api(a.page, "GET", `/api/projects/${PROJECT}/backlog/${pbi.id}`)).body
  const f = (final.data ?? final) as Record<string, unknown>
  console.log("final poNote", f.poNote, "epic", f.epic, "version", f.version)
  report("c2-lock-b", b.issues)
  await del(a.page, pbi.id)
  await a.ctx.close()
  await b.ctx.close()
})

test("F-13 labels and terms", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-C2TERM-${stamp()}`
  const p = await mkPbi(page, tag)
  await page.goto(`${BACKLOG}?pbi=${p.displayId}`)
  const dlg = page.getByRole("dialog", { name: tag })
  console.log("read view has IceBox text:", (await dlg.innerText()).match(/IceBox[^\n]*/g))
  await dlg.getByRole("button", { name: "編集" }).click()
  const btnNames = await dlg.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || (e.textContent ?? "").trim()).filter(Boolean))
  console.log("edit buttons:", JSON.stringify(btnNames))
  console.log("edit IceBox text:", (await dlg.innerText()).match(/IceBox[^\n]*/g))
  await dlg.getByRole("button", { name: "キャンセル" }).click()
  await page.keyboard.press("Escape")
  // filtered empty state
  await page.goto(`${BACKLOG}?q=zzzz-nomatch-zzzz`)
  await page.waitForTimeout(1500)
  console.log("filtered empty:", (await page.getByRole("main").innerText()).match(/[^\n]*(一致|ありません)[^\n]*/g))
  // sprint chips
  await page.goto(BACKLOG)
  await page.waitForLoadState("networkidle")
  console.log("sprint chips:", [...new Set(await page.locator("[data-dnd-row]").getByText(/スプリント|Sprint/).allInnerTexts())].slice(0, 5))
  await del(page, p.id)
  report("c2-terms", issues)
})

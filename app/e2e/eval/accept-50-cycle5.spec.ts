import { expect, test, type Page } from "@playwright/test"
import * as fs from "node:fs"
import { open, snap, visit, flushErrs, overflow, textMatches, PILOT, OUT, type Session } from "./accept-helpers"

/**
 * Acceptance cycle 5 — verification of the cycle-4 conditions / findings
 * (A4-01…A4-06) and the remaining A3 items (06/07/09/11/13/14/16/17/18/20).
 * Read-only except "A3-11 PBI create" (one PBI; ACC_WRITE=1; one background translation).
 * Measurements are logged to reports/accept-data/acc5-c5.log; assertions are soft
 * so every item is measured in one run.
 */
test.describe.configure({ mode: "default" })
test.setTimeout(240_000)

const P = `/projects/${PILOT}`
const PBI238 = "cmuo3il850042a89luwvwguan"
const ACC = process.env.ACC_PROJECT
  ?? (fs.existsSync(`${OUT}/acc-project.txt`) ? fs.readFileSync(`${OUT}/acc-project.txt`, "utf8").trim() : "")
const LOG = "c5.log"
const RAW_STATUS = /→\s*(in_progress|on_hold|not_started|done|delayed|todo|unreviewed|reviewed|frozen|staged|ready)\b/
const ID_WORDS = /\b(Sprint|Minggu|penentuan|Pemetaan|Koordinasi|Inventarisasi|Identifikasi|Standarisasi|Kondisi|Aktual|Skema)\b/

async function planLayout(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement | null
    if (!c) return null
    const cr = c.getBoundingClientRect()
    const firstCell = c.querySelector('[role="row"] > div') as HTMLElement | null
    const visLeft = cr.left + (firstCell?.getBoundingClientRect().width ?? 0)
    const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-bar]"))
    const inView = bars.filter((b) => { const r = b.getBoundingClientRect(); return r.right > visLeft && r.left < cr.right && r.bottom > 0 && r.top < window.innerHeight }).length
    const names = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-name]")).map((e) => ({ t: (e.textContent ?? "").trim(), cut: e.scrollWidth > e.clientWidth + 1 }))
    const header = c.querySelector("[role=columnheader]") as HTMLElement | null
    return { bars: bars.length, inView, nameCol: Math.round(header?.getBoundingClientRect().width ?? 0), names }
  })
}

async function activityText(s: Session): Promise<string> {
  const h = s.page.getByRole("heading", { name: /最近のアクティビティ|Aktivitas terbaru|Aktivitas Terbaru/ }).first()
  if (!(await h.count())) return (await s.page.locator("main").innerText()).slice(0, 4000)
  return h.locator("xpath=ancestor::section[1] | ancestor::div[contains(@class,'rounded')][1]").last().innerText()
}

test("A4-01 activity feed: no raw status codes (ja PO, id Dev)", async ({ browser }) => {
  for (const [role, lang] of [["po", "ja"], ["dev", "id"]] as const) {
    const s = await open(browser, role, { lang, logFile: LOG })
    await visit(s, P, `dash ${lang}`)
    await s.page.waitForTimeout(800)
    const txt = await activityText(s)
    const raw = txt.split("\n").filter((l) => RAW_STATUS.test(l))
    const statusLines = txt.split("\n").filter((l) => /→/.test(l)).slice(0, 8)
    s.log(`A4-01 ${lang}: raw=${raw.length} ${JSON.stringify(raw.slice(0, 5))}; status lines: ${JSON.stringify(statusLines)}`)
    const all = await textMatches(s, RAW_STATUS)
    s.log(`A4-01 ${lang}: page-wide raw matches ${JSON.stringify(all)}`)
    await snap(s, `c5-A4-01-dash-${lang}`, true)
    expect.soft(all, `raw status codes in ${lang} dashboard`).toHaveLength(0)
    flushErrs(s, `A4-01 ${lang}`)
    await s.ctx.close()
  }
})

test("A4-02 velocity sprint names in the ja UI", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: LOG })
  const { page } = s
  await visit(s, `${P}/burndown`, "burndown ja")
  const vel = page.getByRole("tab", { name: /ベロシティ/ }).or(page.getByRole("button", { name: /ベロシティ/ })).first()
  if (await vel.count()) { await vel.click(); await page.waitForTimeout(800) }
  const svgTexts = await page.locator("svg text").evaluateAll((els) => els.map((e) => e.textContent ?? ""))
  const cells = await page.getByRole("cell").allInnerTexts().catch(() => [] as string[])
  const rowHeads = await page.getByRole("rowheader").allInnerTexts().catch(() => [] as string[])
  s.log(`A4-02 svg labels (${svgTexts.length}): ${JSON.stringify(svgTexts.slice(0, 40))}`)
  s.log(`A4-02 rowheaders: ${JSON.stringify(rowHeads.slice(0, 20))}`)
  s.log(`A4-02 cells: ${JSON.stringify(cells.slice(0, 30))}`)
  const idLeak = [...svgTexts, ...rowHeads, ...cells].filter((t) => ID_WORDS.test(t))
  const cut = svgTexts.filter((t) => t.endsWith("…"))
  s.log(`A4-02 id leaks=${idLeak.length} ${JSON.stringify(idLeak.slice(0, 8))}; truncated labels=${cut.length} unique=${new Set(cut).size}`)
  await snap(s, "c5-A4-02-velocity-1440", true)
  expect.soft(idLeak, "Indonesian sprint names in ja velocity").toHaveLength(0)
  expect.soft(new Set(cut).size, "truncated labels indistinguishable").toBe(cut.length)
  flushErrs(s, "A4-02")
  await s.ctx.close()
})

test("A4-03 admin metrics at 375 has no overflow", async ({ browser }) => {
  const s = await open(browser, "admin", { width: 375, height: 812, lang: "ja", logFile: LOG })
  await visit(s, "/admin/metrics", "metrics@375")
  await s.page.waitForTimeout(600)
  const ov = await overflow(s)
  s.log(`A4-03 metrics overflow@375=${ov}`)
  await snap(s, "c5-A4-03-metrics-375", true)
  expect.soft(ov).toBeLessThanOrEqual(0)
  flushErrs(s, "A4-03")
  await s.ctx.close()
})

test("plan (ja PO 1440): A3-09 first view, A4-06 names, A3-14 dates, A4-05 tooltips, A4-04 link picker", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: LOG })
  const { page } = s
  await visit(s, `${P}/plan`, "plan")
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("kanflow:plan:")).forEach((k) => localStorage.removeItem(k)))
  await page.reload()
  await expect(page.locator("[data-plan-bar]").first()).toBeAttached({ timeout: 30_000 })
  await page.waitForTimeout(700)
  const l = await planLayout(page)
  s.log(`A3-09 first view: url=${page.url()} bars=${l?.bars} inView=${l?.inView}`)
  s.log(`A4-06 name column=${l?.nameCol}px cut=${l?.names.filter((n) => n.cut).length}/${l?.names.length} ${JSON.stringify(l?.names.filter((n) => n.cut).map((n) => n.t).slice(0, 8))}`)
  await snap(s, "c5-plan-first-view-1440")
  expect.soft(l?.inView ?? 0, "first view shows a bar").toBeGreaterThan(0)
  // A3-14 plan date columns
  const dateCells = await page.locator("[data-plan-chart] [role=gridcell], [data-plan-chart] [role=cell]").allInnerTexts().catch(() => [] as string[])
  const dates = dateCells.filter((t) => /\d{1,2}\/\d{1,2}/.test(t)).slice(0, 8)
  s.log(`A3-14 plan date cells: ${JSON.stringify(dates)}`)
  // A4-05 tooltips
  const titles = (await textMatches(s, ID_WORDS)).filter((t) => t.startsWith("@title"))
  s.log(`A4-05 plan titles with id words (${titles.length}): ${JSON.stringify(titles.slice(0, 6))}`)
  // A4-04 link picker
  const menus = page.getByRole("button", { name: / の操作$/ })
  const n = await menus.count()
  for (let i = 0; i < Math.min(n, 6); i++) {
    await menus.nth(i).click()
    const link = page.getByRole("menuitem", { name: /PBI.*リンク/ })
    if (await link.count()) {
      await link.click()
      await page.waitForTimeout(1000)
      const dlg = page.getByRole("dialog")
      const labels = (await dlg.locator("label:has(input[type=checkbox])").allInnerTexts()).map((x) => x.replace(/\n/g, " "))
      const leaks = labels.filter((x) => ID_WORDS.test(x))
      const glued = labels.filter((x) => /[A-Za-z]{4,}.*[぀-ヿ一-龯]{3,}/.test(x) && ID_WORDS.test(x))
      s.log(`A4-04 picker (${labels.length}) first: ${JSON.stringify(labels.slice(0, 10))}`)
      s.log(`A4-04 id-source labels=${leaks.length} ${JSON.stringify(leaks.slice(0, 6))} glued=${glued.length}`)
      await snap(s, "c5-A4-04-link-picker")
      expect.soft(glued, "source+translation glued").toHaveLength(0)
      await page.keyboard.press("Escape")
      break
    }
    await page.keyboard.press("Escape")
  }
  flushErrs(s, "plan")
  await s.ctx.close()
})

test("A4-05 icebox / backlog tooltips (ja)", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: LOG })
  for (const [name, url] of [["icebox", `${P}/icebox`], ["backlog", `${P}/backlog`]] as const) {
    await visit(s, url, name)
    await s.page.waitForTimeout(800)
    const titles = (await s.page.evaluate(() => Array.from(document.querySelectorAll("[title]")).map((e) => e.getAttribute("title") ?? ""))).filter((t) => /[A-Za-z]{5,}/.test(t) && /\b(Pemetaan|Koordinasi|Standarisasi|Identifikasi|Inventarisasi|Kondisi|dan|untuk|yang)\b/.test(t))
    const bare = titles.filter((t) => !t.includes("\n"))
    s.log(`A4-05 ${name}: id-word titles=${titles.length} bare(no displayed-text line)=${bare.length} sample=${JSON.stringify(titles.slice(0, 3))} bareSample=${JSON.stringify(bare.slice(0, 3))}`)
  }
  flushErrs(s, "A4-05")
  await s.ctx.close()
})

test("A3-07 / A3-16 PO home (ja): role chips + PO KPIs", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: LOG })
  await visit(s, "/", "home")
  await s.page.waitForTimeout(600)
  const main = await s.page.locator("main").innerText()
  s.log(`A3-16 home top: ${main.slice(0, 600).replace(/\n/g, " | ")}`)
  const mixed = await textMatches(s, /^開発$/)
  s.log(`A3-07 「開発」 chips: ${mixed.length}`)
  await snap(s, "c5-po-home-1440", true)
  expect.soft(mixed).toHaveLength(0)
  flushErrs(s, "home")
  await s.ctx.close()
})

test("A3-16 dev (id) dashboard AI report line + A3-14 id dates", async ({ browser }) => {
  const s = await open(browser, "dev", { lang: "id", logFile: LOG })
  const { page } = s
  await visit(s, P, "dash id")
  await page.waitForTimeout(800)
  const chip = page.getByTestId("ai-report-language-chip")
  s.log(`A3-16 language chips: ${(await chip.allInnerTexts()).join(" | ")}`)
  const jaInId = await textMatches(s, /[぀-ヿ一-龯]{4,}/)
  s.log(`A3-16 JA text in id dashboard (${jaInId.length}): ${JSON.stringify(jaInId.slice(0, 10))}`)
  await snap(s, "c5-dev-dash-1440", true)
  if (ACC) {
    await visit(s, `${ACC}/sprints`, "acc sprints id")
    const body = await page.locator("main").innerText()
    const ranges = body.match(/\d{1,2}\s\w{3}\s\d{4}\s*[–-]\s*\d{1,2}\s\w{3}\s\d{4}|\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/g) ?? []
    const due = body.match(/Tenggat[^\n]{0,14}/g) ?? []
    s.log(`A3-14 id sprint ranges=${JSON.stringify(ranges.slice(0, 3))} due=${JSON.stringify(due.slice(0, 3))}`)
  }
  flushErrs(s, "dev dash")
  await s.ctx.close()
})

test("A3-13 section manager dashboard (ja)", async ({ browser }) => {
  const s = await open(browser, "sec", { lang: "ja", logFile: LOG })
  await visit(s, P, "sec dash")
  await s.page.waitForTimeout(600)
  const myTasks = await s.page.getByText("このプロジェクトの自分のタスク").count()
  const aiBtn = await s.page.getByRole("button", { name: /進捗レポート生成/ }).count()
  s.log(`A3-13 sec: myTasks widget=${myTasks} ai report button=${aiBtn}`)
  await snap(s, "c5-sec-dash-1440", true)
  expect.soft(myTasks).toBe(0)
  expect.soft(aiBtn).toBe(0)
  flushErrs(s, "sec dash")
  await s.ctx.close()
})

test("A3-17 dev (id) board depth at 375", async ({ browser }) => {
  test.skip(!ACC, "no E2E-ACC project")
  const s = await open(browser, "dev", { width: 375, height: 812, lang: "id", logFile: LOG })
  const { page } = s
  await visit(s, `${ACC}/sprints?view=board`, "board@375")
  const first = page.getByRole("region", { name: /Papan kanban/ }).getByRole("listitem").first()
  await expect(first).toBeVisible({ timeout: 20_000 })
  const y = await first.evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY))
  s.log(`A3-17 first board card y=${y}px overflow=${await overflow(s)}`)
  await snap(s, "c5-dev-board-375", true)
  flushErrs(s, "board375")
  await s.ctx.close()
})

test("A3-18 admin password minimum (7 chars rejected)", async ({ browser }) => {
  const s = await open(browser, "admin", { lang: "ja", logFile: LOG })
  const { page } = s
  await visit(s, "/admin/users", "users")
  await page.getByRole("button", { name: "ユーザー追加" }).click()
  const d = page.getByRole("dialog")
  await d.getByRole("textbox", { name: /名前/ }).fill("E2E-ACC5 検証")
  await d.getByRole("textbox", { name: /メール/ }).fill("e2e-acc5-never@example.test")
  await d.getByRole("textbox", { name: /初期パスワード/ }).fill("abc1234")
  await d.getByRole("button", { name: "作成" }).click()
  await page.waitForTimeout(600)
  const txt = (await d.innerText()).replace(/\n/g, " / ")
  s.log(`A3-18 7-char password: ${txt.slice(0, 300)}`)
  await snap(s, "c5-admin-pw-min")
  expect.soft(txt).toMatch(/8/)
  await page.keyboard.press("Escape")
  const discard = page.getByRole("alertdialog").getByRole("button", { name: "破棄して閉じる" })
  if (await discard.count()) await discard.click()
  flushErrs(s, "A3-18")
  await s.ctx.close()
})

test("A3-20 composer shows @Name (no send), guide badges, 原文 tags", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: LOG })
  const { page } = s
  await visit(s, `${P}/backlog?pbi=${PBI238}&tab=comments`, "pbi238")
  const detail = page.getByRole("dialog")
  const box = detail.getByRole("textbox", { name: "新しいコメント" })
  await box.click()
  await box.pressSequentially("確認 @E2E D", { delay: 30 })
  await expect(page.getByRole("listbox")).toContainText("E2E Dev")
  await page.keyboard.press("Enter")
  const v = await box.inputValue()
  s.log(`A3-20 composer value after pick: "${v}"`)
  await snap(s, "c5-A3-20-composer")
  expect.soft(v).not.toContain("@[")
  await box.fill("")
  await page.keyboard.press("Escape")
  const discard = page.getByRole("alertdialog").getByRole("button", { name: /破棄/ })
  if (await discard.count()) await discard.click()
  await visit(s, `${P}/guide`, "guide")
  const eng = await textMatches(s, /^(ARTIFACT|EVENT)$/)
  s.log(`A3-20 guide English badges: ${JSON.stringify(eng)}`)
  await visit(s, `${P}/backlog`, "backlog")
  await page.waitForTimeout(800)
  const tags = await page.getByText("原文", { exact: true }).count()
  s.log(`A3-20 「原文」 tags on backlog: ${tags}`)
  flushErrs(s, "A3-20")
  await s.ctx.close()
})

test("A3-11 PBI create scrolls to and highlights the new card (writes one PBI)", async ({ browser }) => {
  test.skip(process.env.ACC_WRITE !== "1", "set ACC_WRITE=1 (one PBI; one background translation)")
  const s = await open(browser, "po", { lang: "ja", logFile: LOG })
  const { page } = s
  await visit(s, `${P}/backlog`, "backlog")
  await expect(page.locator("[data-dnd-row]").first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  const d = page.getByRole("dialog", { name: "PBI追加" })
  await d.getByRole("textbox", { name: "イニシアティブ" }).fill("E2E-ACC5 作成フィードバック確認")
  await d.getByRole("button", { name: "追加" }).click()
  await expect(d).toBeHidden()
  const card = page.locator("li[id^=pbi-card-]", { hasText: "E2E-ACC5 作成フィードバック確認" })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(700)
  const info = await card.evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, focused: e.contains(document.activeElement) || e === document.activeElement, cls: e.className.slice(0, 200) }
  })
  s.log(`A3-11 new card: ${JSON.stringify(info)} url=${page.url()} toasts=${(await page.locator("[role=status]").allInnerTexts()).join(" | ")}`)
  await snap(s, "c5-A3-11-created")
  expect.soft(info.top >= 0 && info.bottom <= info.vh, "new card in viewport").toBe(true)
  flushErrs(s, "A3-11")
  await s.ctx.close()
})

import { expect, test, type Page } from "@playwright/test"
import { PROJECT, SHOTS, addDays, todayLabel, bar, createItem, deleteItem, getPlan, gotoPlan, report, row, stamp, userPage, type Item } from "./plan-support"

/**
 * Date display of the master plan: end-inclusive bars, milestone centring,
 * two-tier scale per zoom, weekend shading, today line/label, localized dates,
 * grid columns, column visibility and the narrow-screen collapse.
 */


const DW = { day: 32, week: 14, month: 5, quarter: 2 } as const
let root: Item
let leaf: Item
let ms: Item
let today = ""

async function geometry(page: Page, id: string) {
  return page.evaluate((id) => {
    const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null)
    const b = r(document.querySelector(`[data-plan-bar="${id}"]`))
    const tl = r(document.querySelector("[data-plan-today]"))
    return { bar: b && { x: b.x, w: b.width, cx: b.x + b.width / 2 }, today: tl && { cx: tl.x + tl.width / 2 } }
  }, id)
}

/** Header labels (top tier / bottom tier) of the time scale. */
async function scaleLabels(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-plan-chart] [role="columnheader"][aria-label] > div') as HTMLElement | null
    if (!header) return { top: [] as string[], bottom: [] as string[], weekendHeaderCells: 0 }
    const tiers = header.querySelectorAll(":scope > div")
    const txt = (el: Element) => (el.textContent ?? "").trim()
    const top = Array.from(tiers[0]?.children ?? []).map(txt)
    const bottomCells = Array.from(tiers[1]?.children ?? [])
    return { top, bottom: bottomCells.map(txt), weekendHeaderCells: bottomCells.filter((c) => c.className.includes("bg-surface-sunken")).length }
  })
}

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  today = (await getPlan(page)).today
  const s = stamp()
  // Fixed calendar: 2026-10-01 (Thu) .. 2026-10-07 (Wed) = 7 days; milestone 2026-10-15.
  root = await createItem(page, { name: `E2E-D${s} 日付検証`, plannedStart: "2026-10-01", plannedEnd: "2026-10-07" })
  leaf = await createItem(page, { name: `E2E-D${s} 7日タスク`, parentId: root.id, plannedStart: "2026-10-01", plannedEnd: "2026-10-07" })
  ms = await createItem(page, { name: `E2E-D${s} MS`, parentId: root.id, plannedStart: "2026-10-15", plannedEnd: "2026-10-15", isMilestone: true })
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  await deleteItem(page, root.id)
  await ctx.close()
})

for (const zoom of ["day", "week", "month", "quarter"] as const) {
  test(`bar geometry + scale at zoom=${zoom}`, async ({ browser }) => {
    const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
    await gotoPlan(page, zoom === "week" ? "" : `?zoom=${zoom}`)
    await expect(bar(page, leaf.id)).toBeAttached()
    await row(page, leaf.id).scrollIntoViewIfNeeded()
    const g = await geometry(page, leaf.id)
    const m = await geometry(page, ms.id)
    const dw = DW[zoom]
    expect(g.today, "today line rendered").not.toBeNull()
    // Leaf 10/01..10/07: 7 day columns wide.
    expect(g.bar!.w).toBeCloseTo(7 * dw, 0)
    // Left edge = start of 10/01 = today centre + (offset - 0.5) days.
    const offset = (Date.parse("2026-10-01") - Date.parse(today)) / 86_400_000
    expect(g.bar!.x).toBeCloseTo(g.today!.cx + (offset - 0.5) * dw, 0)
    // Milestone centred on 10/15.
    const msOffset = (Date.parse("2026-10-15") - Date.parse(today)) / 86_400_000
    expect(m.bar!.cx).toBeCloseTo(g.today!.cx + msOffset * dw, 0)

    const labels = await scaleLabels(page)
    console.log(`zoom=${zoom} top=${JSON.stringify(labels.top.slice(0, 8))} bottom=${JSON.stringify(labels.bottom.slice(0, 16))} weekendHeaderCells=${labels.weekendHeaderCells}`)
    const stripes = await page.locator("[data-plan-body] > div[aria-hidden] > div.bg-surface-sunken\\/70").count()
    console.log(`zoom=${zoom} weekend body stripes=${stripes}`)
    if (zoom === "day" || zoom === "week") {
      expect(labels.top.some((l) => l.includes("2026年10月"))).toBeTruthy()
      expect(stripes).toBeGreaterThan(0)
    } else {
      expect(labels.top.some((l) => l.includes("2026"))).toBeTruthy()
      expect(stripes).toBe(0)
    }
    if (zoom === "day") expect(labels.bottom).toContain("1木")
    if (zoom === "week") expect(labels.bottom).toContain("10/5")
    if (zoom === "month") expect(labels.bottom).toContain("10月")
    if (zoom === "quarter") expect(labels.bottom).toContain("Q4")
    await page.screenshot({ path: `${SHOTS}/10-zoom-${zoom}-1440.png` })
    report(`zoom ${zoom}`, issues)
    await ctx.close()
  })
}

test("today label, initial scroll to open work, compact grid (F-01, F-05)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  const label = page.locator("[data-plan-today-label]")
  const { today } = await getPlan(page)
  await expect(label).toHaveText(`今日 ${todayLabel(today, "ja")}`)
  // F-05: the today pill never covers a month label of the top tier.
  const overlap = await page.evaluate(() => {
    const pill = document.querySelector("[data-plan-today-label]")!.getBoundingClientRect()
    const header = document.querySelector('[data-plan-chart] [role="columnheader"][aria-label] > div') as HTMLElement
    return Array.from(header.querySelectorAll(":scope > div:first-child > div > span")).some((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.left < pill.right && r.right > pill.left
    })
  })
  expect(overlap).toBe(false)

  // F-01: the default grid (name + period + progress) leaves most of the chart to the timeline.
  const s = await page.evaluate(() => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement
    const grid = (document.querySelector('[data-plan-chart] [role="row"] > div') as HTMLElement).getBoundingClientRect()
    const cr = c.getBoundingClientRect()
    return { scrollLeft: c.scrollLeft, gridRight: grid.right, gridWidth: grid.width, chartWidth: cr.width }
  })
  console.log("layout", JSON.stringify(s))
  // A4-06 (cycle 4): at ≥ 1280 px the name column is sized to the longest name (≤ 360px), so the
  // default grid is ≤ 360 + period + progress and the timeline still keeps most of the rest.
  expect(s.gridWidth).toBeLessThanOrEqual(360 + 128 + 104 + 1)
  expect(s.chartWidth - s.gridWidth).toBeGreaterThan(s.chartWidth * 0.45)
  // Initial scroll: the earliest unfinished (e.g. overdue) bar starts ~3 days right of the grid.
  const plan = await getPlan(page)
  const rendered = new Set(await page.locator("[data-plan-bar]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan-bar"))))
  const open = plan.items.filter((i: any) => rendered.has(i.id) && i.status !== "done" && i.status !== "on_hold" && i.scheduleState !== "done")
  const earliest = open.reduce((a: any, b: any) => (b.plannedStart < a.plannedStart ? b : a))
  const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  // N-02: open work more than 60 days before today would hide today → the view starts at today − 14
  // and the older bars are announced by the "◀ n 件" pill instead.
  const farBehind = earliest.plannedStart < today && daysBetween(earliest.plannedStart, today) + 3 > 60
  if (farBehind) {
    const todayBox = (await label.boundingBox())!
    const chartBox = (await page.locator("[data-plan-chart]").boundingBox())!
    expect(todayBox.x).toBeGreaterThanOrEqual(s.gridRight)
    expect(todayBox.x + todayBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width)
    await expect(page.locator('[data-plan-offscreen="before"]')).toBeVisible()
  }
  const anchor = earliest.plannedStart < today && !farBehind ? earliest : null
  if (anchor) {
    const box = (await bar(page, anchor.id).boundingBox())!
    console.log("earliest open item", anchor.plannedStart, "bar x", box.x, "grid right", s.gridRight)
    expect(box.x).toBeGreaterThanOrEqual(s.gridRight + 2 * 14 - 2)
    expect(box.x).toBeLessThanOrEqual(s.gridRight + 4 * 14 + 2)
  }
  // Items right of the view are announced by the edge indicator; it scrolls to them.
  const after = page.locator('[data-plan-offscreen="after"]')
  if (await after.count()) {
    const before = s.scrollLeft
    await after.click()
    await expect.poll(() => page.locator("[data-plan-chart]").evaluate((e) => e.scrollLeft)).toBeGreaterThan(before)
  }

  // Default cells: compact period + progress.
  const texts = (await row(page, leaf.id).getByRole("cell").allInnerTexts()).map((t) => t.trim())
  console.log("leaf cells", JSON.stringify(texts))
  expect(texts.slice(0, 2)).toEqual(["10/01–10/07", "0%"])
  const rootTexts = (await row(page, root.id).getByRole("cell").allInnerTexts()).map((t) => t.trim())
  expect(rootTexts[0]).toBe("10/01–10/15")
  const msTexts = (await row(page, ms.id).getByRole("cell").allInnerTexts()).map((t) => t.trim())
  expect(msTexts[0]).toBe("10/15(木)")

  // All columns (toggle persisted in localStorage) keep the full table.
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ columns: ["period", "start", "end", "duration", "progress", "owner", "status"] })), `kanflow:plan:${PROJECT}`)
  await page.reload()
  await expect(bar(page, leaf.id)).toBeAttached()
  const full = (await row(page, leaf.id).getByRole("cell").allInnerTexts()).map((t) => t.trim())
  expect(full.slice(0, 7)).toEqual(["10/01–10/07", "10/01(木)", "10/07(水)", "7日", "0%", "—", "未着手"])
  await page.evaluate((key) => localStorage.removeItem(key), `kanflow:plan:${PROJECT}`)
  report("today/grid", issues)
  await ctx.close()
})

test("localized dates after switching the header language (en, id)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  const lang = page.locator("header select").first()
  try {
    await lang.selectOption("en")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Master Plan/)
    await expect(row(page, leaf.id).getByRole("cell").first()).toHaveText("Oct 1–7")
    await expect(row(page, leaf.id).getByRole("cell").nth(1)).toHaveText("0%")
    await expect(page.locator("[data-plan-chart] span", { hasText: /^Today / })).toHaveText(`Today ${todayLabel((await getPlan(page)).today, "en")}`)
    const en = await scaleLabels(page)
    console.log("en top", JSON.stringify(en.top.slice(0, 4)), "bottom", JSON.stringify(en.bottom.slice(0, 6)))
    expect(en.top.join("|")).toMatch(/October 2026/)
    await page.screenshot({ path: `${SHOTS}/11-lang-en-1440.png` })
    await lang.selectOption("id")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Rencana Induk/)
    await expect(row(page, leaf.id).getByRole("cell").first()).toHaveText("1–7 Okt")
    // F-06: grid cells never wrap (one line = row height stays compact)
    const heights = await row(page, leaf.id).getByRole("cell").evaluateAll((els) => els.map((e) => (e.firstElementChild ?? e).getBoundingClientRect().height))
    expect(Math.max(...heights)).toBeLessThan(30)
    const idl = await scaleLabels(page)
    console.log("id top", JSON.stringify(idl.top.slice(0, 4)), "bottom", JSON.stringify(idl.bottom.slice(0, 6)))
    expect(idl.top.join("|")).toMatch(/Oktober 2026/)
    await page.screenshot({ path: `${SHOTS}/11-lang-id-1440.png` })
    // Bar aria-label carries full localized dates.
    console.log("id bar label:", await bar(page, leaf.id).getAttribute("aria-label"))
  } finally {
    await lang.selectOption("ja")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/全体計画/)
  }
  report("lang", issues)
  await ctx.close()
})

test("column show/hide and the splitter persist across reload (F-01, F-07)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  const headers = page.locator("[data-plan-chart] [role=columnheader]")
  await expect(headers.filter({ hasText: /^期間$/ })).toHaveCount(1)
  await expect(headers.filter({ hasText: /^担当$/ })).toHaveCount(0)
  await page.getByRole("button", { name: "表示する列" }).click()
  await page.getByRole("checkbox", { name: "担当" }).check()
  await page.getByRole("checkbox", { name: "日数" }).check()
  await page.keyboard.press("Escape")
  await expect(headers.filter({ hasText: /^担当$/ })).toHaveCount(1)
  await expect(headers.filter({ hasText: /^日数$/ })).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/12-columns-shown.png` })
  // Splitter: keyboard-resizable name column
  const splitter = page.getByRole("separator", { name: "表の幅" })
  const w0 = Number(await splitter.getAttribute("aria-valuenow"))
  await splitter.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await expect(splitter).toHaveAttribute("aria-valuenow", String(w0 + 32))
  await page.reload()
  await expect(bar(page, leaf.id)).toBeAttached()
  await expect(headers.filter({ hasText: /^担当$/ })).toHaveCount(1)
  await expect(page.getByRole("separator", { name: "表の幅" })).toHaveAttribute("aria-valuenow", String(w0 + 32))
  const nameW = await headers.first().evaluate((e) => e.getBoundingClientRect().width)
  // (the header row's 1px right border is shared by the flex cells: allow ±1px)
  expect(Math.abs(Math.round(nameW) - (w0 + 32))).toBeLessThanOrEqual(1)
  // Mouse drag on the splitter
  const sb = (await page.getByRole("separator", { name: "表の幅" }).boundingBox())!
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 100)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width / 2 - 64, sb.y + 100, { steps: 4 })
  await page.mouse.up()
  // (N-03: the name column never gets narrower than 160px)
  await expect(page.getByRole("separator", { name: "表の幅" })).toHaveAttribute("aria-valuenow", String(Math.max(160, w0 + 32 - 64)))
  // Back to the defaults
  await page.getByRole("button", { name: "表示する列" }).click()
  await page.getByRole("checkbox", { name: "担当" }).uncheck()
  await page.getByRole("checkbox", { name: "日数" }).uncheck()
  await page.keyboard.press("Escape")
  await expect(headers.filter({ hasText: /^担当$/ })).toHaveCount(0)
  // Grid collapse to names only (toggle button in the name header).
  await page.getByRole("button", { name: "表を名前だけにする" }).click()
  await expect(headers.filter({ hasText: /^期間$/ })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "表示する列" })).toBeDisabled()
  await page.screenshot({ path: `${SHOTS}/12-grid-collapsed-1440.png` })
  await page.getByRole("button", { name: "表の列を表示" }).click()
  await expect(headers.filter({ hasText: /^期間$/ })).toHaveCount(1)
  await page.evaluate((key) => localStorage.removeItem(key), `kanflow:plan:${PROJECT}`)
  report("columns", issues)
  await ctx.close()
})

test("narrow screen (375px): grid collapses to names, chart usable", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await gotoPlan(page)
  await expect(bar(page, leaf.id)).toBeAttached()
  const headers = page.locator("[data-plan-chart] [role=columnheader]")
  await expect(headers.filter({ hasText: /^開始$/ })).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log("page horizontal overflow px @375:", overflow)
  await page.screenshot({ path: `${SHOTS}/13-narrow-375.png`, fullPage: true })
  await row(page, leaf.id).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/13-narrow-375-chart.png` })
  report("narrow", issues)
  await ctx.close()
})

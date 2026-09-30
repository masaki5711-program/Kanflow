import { expect, test, type Page } from "@playwright/test"
import { PROJECT, PROJECT2, SHOTS, api, bar, createItem, deleteItem, getPlan, gotoPlan, report, stamp, userPage } from "./plan-support"

/**
 * Cycle 2: re-verification of cycle-1 findings F-01, F-02, F-04, F-05, F-06,
 * F-07, F-08, F-09, F-10, F-14, F-16 at 1440 / 1280 / 768 / 375 px.
 * Mostly measurements + screenshots (logged as JSON for the report).
 */

const WIDTHS = [1440, 1280, 768, 375] as const
const vp = (w: number) =>
  w <= 400
    ? { viewport: { width: w, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: w, height: 900 } }

async function layout(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement
    const cr = c.getBoundingClientRect()
    const gridCell = c.querySelector('[role="row"] > div') as HTMLElement | null
    const gridW = gridCell ? gridCell.getBoundingClientRect().width : 0
    const today = document.querySelector("[data-plan-today-label]") as HTMLElement | null
    const tr = today?.getBoundingClientRect()
    const h1 = document.querySelector("h1")!.getBoundingClientRect()
    const pillEls = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-offscreen], [data-plan-today-pill]"))
    const pills = pillEls.map((p) => `${p.dataset.planOffscreen ?? `today-${p.dataset.planTodayPill}`}:${p.textContent}`)
    // N-04: every pill sits in the scale header band (52px) and covers no bar / bar label / chip
    const headerBottom = cr.top + 1 + 52
    const marks = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-bar], [data-plan-row] [role=cell] span")).map((e) => e.getBoundingClientRect())
    const pillsInHeader = pillEls.every((p) => p.getBoundingClientRect().bottom <= headerBottom + 1)
    const pillsCoverMarks = pillEls.some((p) => {
      const r = p.getBoundingClientRect()
      return marks.some((m) => m.width > 0 && m.left < r.right && m.right > r.left && m.top < r.bottom && m.bottom > r.top)
    })
    const todayPill = !!document.querySelector("[data-plan-today-pill]")
    const nameWidth = Math.round((c.querySelector("[role=columnheader]") as HTMLElement).getBoundingClientRect().width)
    // N-07: a (sticky) top-tier label is readable inside the visible timeline (≥ 40px of it on screen)
    const tierLabelVisible = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-tier-label]")).some((e) => {
      const r = e.getBoundingClientRect()
      const shown = Math.min(r.right, cr.right) - Math.max(r.left, cr.left + gridW)
      return r.width > 0 && shown >= Math.min(40, r.width)
    })
    // bars at least partly in the visible timeline
    const visLeft = cr.left + gridW
    const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-bar]"))
    const visibleBars = bars.filter((b) => {
      const r = b.getBoundingClientRect()
      return r.right > visLeft && r.left < cr.right
    }).length
    const labels = Array.from(document.querySelectorAll<HTMLElement>("label")).filter((l) => /状態|担当者|Status|Owner|Penanggung/.test(l.textContent ?? "")).map((l) => {
      // height of the label's own text (not the <select> inside it)
      const tn = Array.from(l.childNodes).find((n) => n.nodeType === 3 && n.textContent!.trim()) ?? Array.from(l.querySelectorAll("span")).find((sp) => !sp.querySelector("select"))?.firstChild
      if (!tn) return { t: l.textContent?.trim().slice(0, 6), h: 0 }
      const r = document.createRange()
      r.selectNodeContents(tn)
      return { t: tn.textContent?.trim(), h: Math.round(r.getBoundingClientRect().height) }
    })
    return {
      chartWidth: Math.round(cr.width),
      gridWidth: Math.round(gridW),
      visibleTimeline: Math.round(cr.width - gridW),
      scrollLeft: Math.round(c.scrollLeft),
      todayVisible: !!tr && tr.left >= visLeft - 2 && tr.right <= cr.right + 2,
      todayLabelInChart: !tr || tr.width === 0 || (tr.right <= cr.right + 1 && tr.left >= cr.left + gridW - 1) || tr.right < visLeft || tr.left > cr.right,
      todayPill,
      pills,
      pillsInHeader,
      pillsCoverMarks,
      nameWidth,
      tierLabelVisible,
      bars: bars.length,
      visibleBars,
      h1: { w: Math.round(h1.width), h: Math.round(h1.height) },
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filterLabels: labels,
    }
  })
}

for (const w of WIDTHS) {
  test(`F-01/F-08/F-09 initial view at ${w}px (PO, ja, week)`, async ({ browser }) => {
    const { ctx, page, issues } = await userPage(browser, "po", vp(w))
    await gotoPlan(page)
    await expect(page.locator("[data-plan-bar]").first()).toBeAttached()
    await page.waitForTimeout(600)
    const l = await layout(page)
    console.log(`layout ${w}:`, JSON.stringify(l))
    await page.screenshot({ path: `${SHOTS}/c2-F01-initial-${w}.png` })
    // Header overlap (F-09): bounding boxes of header controls must not intersect
    const overlaps = await page.evaluate(() => {
      const header = document.querySelector("header")
      if (!header) return []
      const els = Array.from(header.querySelectorAll<HTMLElement>("a, button")).filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"
      })
      const out: string[] = []
      for (let i = 0; i < els.length; i++)
        for (let j = i + 1; j < els.length; j++) {
          if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
          const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect()
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (ix > 2 && iy > 2) out.push(`${els[i].getAttribute("aria-label") ?? els[i].textContent?.trim().slice(0, 20)} × ${els[j].getAttribute("aria-label") ?? els[j].textContent?.trim().slice(0, 20)}`)
        }
      return out
    })
    console.log(`header overlaps ${w}:`, JSON.stringify(overlaps))
    expect(l.pageOverflow).toBeLessThanOrEqual(0)
    expect(overlaps).toEqual([])
    expect(l.h1.w).toBeGreaterThan(100)
    for (const fl of l.filterLabels) expect(fl.h, `label ${fl.t} on one line`).toBeLessThan(28)
    // A3-09 (cycle 4): the first view always shows a bar — an empty anchored window fits everything instead
    expect(l.visibleBars, "bars visible on the first view").toBeGreaterThan(0)
    // N-02: today is on screen, or a "今日 ◀/▶" pill points at it
    expect(l.todayVisible || l.todayPill, "today visible or pointed at").toBeTruthy()
    // N-04: pills live in the header band and cover nothing
    expect(l.pillsInHeader).toBe(true)
    expect(l.pillsCoverMarks).toBe(false)
    // N-07: a year / month label is readable at the left of the timeline
    expect(l.tierLabelVisible).toBe(true)
    // N-08: at tablet width the default grid keeps ≤ 45% of the chart (40 / 60 split)
    if (w === 768) expect(l.gridWidth).toBeLessThanOrEqual(Math.round(l.chartWidth * 0.45))
    // F-07: phones offer "名前優先" — names get most of the width
    if (w === 375) {
      const group = page.getByRole("group", { name: "表示の優先" })
      await group.getByRole("button", { name: "名前優先" }).click()
      await expect.poll(async () => (await layout(page)).nameWidth).toBeGreaterThanOrEqual(250)
      const names = await page.locator("[data-plan-name]").evaluateAll((els) => els.map((e) => ({ t: e.textContent, w: Math.round(e.getBoundingClientRect().width) })))
      console.log("F-07 names-first 375:", JSON.stringify(names.slice(0, 4)))
      for (const n of names) expect(n.w, `name ${n.t}`).toBeGreaterThanOrEqual(140)
      await page.screenshot({ path: `${SHOTS}/c2-F07-names-first-375.png` })
      await group.getByRole("button", { name: "タイムライン優先" }).click()
      await expect.poll(async () => (await layout(page)).nameWidth).toBeLessThan(250)
    }

    // Edge pills: after → reveals the nearest later bar
    const after = page.locator('[data-plan-offscreen="after"]')
    if (await after.count()) {
      const before = l.scrollLeft
      await page.screenshot({ path: `${SHOTS}/c2-F01-pills-${w}.png`, clip: await page.locator("[data-plan-chart]").boundingBox() ?? undefined })
      await after.click()
      await page.waitForTimeout(400)
      const l2 = await layout(page)
      console.log(`after pill click ${w}:`, before, "→", l2.scrollLeft, JSON.stringify(l2.pills), "visibleBars", l2.visibleBars)
      expect(l2.scrollLeft).toBeGreaterThan(before)
      await page.screenshot({ path: `${SHOTS}/c2-F01-after-pill-${w}.png` })
    }
    const beforePill = page.locator('[data-plan-offscreen="before"]')
    if (await beforePill.count()) {
      const s0 = (await layout(page)).scrollLeft
      await beforePill.click()
      await page.waitForTimeout(400)
      const s1 = (await layout(page)).scrollLeft
      console.log(`before pill click ${w}:`, s0, "→", s1)
      expect(s1).toBeLessThan(s0)
    }
    // 今日へ
    const todayBtn = page.getByRole("button", { name: "今日へ" })
    if (await todayBtn.isVisible()) {
      await todayBtn.click()
      await page.waitForTimeout(300)
      const lt = await layout(page)
      console.log(`after 今日へ ${w}: todayVisible`, lt.todayVisible, "visibleBars", lt.visibleBars, JSON.stringify(lt.pills))
      expect(lt.todayVisible).toBeTruthy()
      await page.screenshot({ path: `${SHOTS}/c2-F01-today-${w}.png` })
    }
    report(`layout ${w}`, issues)
    await ctx.close()
  })
}

test("F-01 quarter + month zoom at 1440: first view shows the open work", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", vp(1440))
  for (const z of ["month", "quarter"]) {
    await gotoPlan(page, `?zoom=${z}`)
    await page.waitForTimeout(500)
    const l = await layout(page)
    console.log(`zoom ${z}:`, JSON.stringify(l))
    await page.screenshot({ path: `${SHOTS}/c2-F01-zoom-${z}-1440.png` })
    // N-02 / N-07: today visible (pill not clipped) or pointed at; the year label is readable
    expect(l.todayVisible || l.todayPill).toBeTruthy()
    expect(l.todayLabelInChart).toBe(true)
    expect(l.tierLabelVisible).toBe(true)
    // N-07: scrolled so that today sits at the right edge, the today pill is clamped inside
    await page.locator("[data-plan-chart]").evaluate((c) => {
      const t = document.querySelector("[data-plan-today]")!.getBoundingClientRect()
      c.scrollLeft += t.left - (c.getBoundingClientRect().right - 26)
    })
    await page.waitForTimeout(300)
    const edge = await layout(page)
    console.log(`zoom ${z} today at right edge:`, JSON.stringify({ todayVisible: edge.todayVisible, inChart: edge.todayLabelInChart }))
    expect(edge.todayLabelInChart).toBe(true)
  }
  await ctx.close()
})

test("F-02 dev (ja) header at 375 and 768", async ({ browser }) => {
  for (const w of [375, 768]) {
    const { ctx, page } = await userPage(browser, "dev", vp(w))
    // dev's UI language is id; the ja case is the one that broke in cycle 1
    await page.goto("/")
    expect((await api(page, "PATCH", "/api/user/language", { language: "ja" })).status).toBeLessThan(300)
    await gotoPlan(page)
    const lang = await page.evaluate(() => document.documentElement.lang)
    const box = await page.getByRole("heading", { level: 1 }).boundingBox()
    const desc = await page.getByRole("heading", { level: 1 }).evaluate((h) => {
      const p = h.parentElement?.querySelector("p")
      return p ? Math.round(p.getBoundingClientRect().width) : null
    })
    console.log(`dev ${w} lang=${lang} h1`, JSON.stringify(box), "desc width", desc)
    expect(box!.width).toBeGreaterThan(100)
    await page.screenshot({ path: `${SHOTS}/c2-F02-dev-${w}.png` })
    await api(page, "PATCH", "/api/user/language", { language: "id" })
    await ctx.close()
  }
})

test("F-04 print both modes → PDF", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", vp(1440))
  for (const scope of ["visible", "all"] as const) {
    await gotoPlan(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => { window.print = () => undefined })
    await page.getByRole("button", { name: "その他の操作" }).click()
    await page.getByRole("menuitem", { name: "印刷" }).click()
    const dlg = page.getByRole("dialog", { name: "印刷" })
    await expect(dlg).toBeVisible()
    await page.waitForTimeout(400)
    if (scope === "visible") await page.screenshot({ path: `${SHOTS}/c2-F04-print-dialog.png` })
    const ranges = await dlg.locator("label").allInnerTexts()
    console.log("print dialog options:", JSON.stringify(ranges))
    await dlg.getByRole("radio", { name: scope === "visible" ? /表示中の期間/ : /全期間/ }).check()
    await dlg.getByRole("button", { name: "印刷する" }).click()
    await page.emulateMedia({ media: "print" })
    await page.waitForTimeout(400)
    const info = await page.evaluate(() => {
      const c = document.querySelector("[data-plan-chart]") as HTMLElement
      const table = c.querySelector('[role="table"]') as HTMLElement
      const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-bar]"))
      const cr = c.getBoundingClientRect()
      const clipped = bars.filter((b) => b.getBoundingClientRect().right > cr.right + 1).length
      const top = Array.from(c.querySelectorAll<HTMLElement>('[aria-hidden="true"] span.truncate')).slice(0, 12).map((s) => s.textContent)
      // N-06: no scale label wraps ("5/月") or is cut to an ellipsis ("2…")
      const header = c.querySelector('[role="columnheader"][aria-label] > div') as HTMLElement
      const scaleTexts = Array.from(header.querySelectorAll<HTMLElement>("span")).filter((s) => (s.textContent ?? "").trim() && !s.hasAttribute("data-plan-today-label"))
      const wrappedScale = scaleTexts.filter((s) => s.getBoundingClientRect().height > 18).map((s) => s.textContent)
      const cutScale = scaleTexts.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent)
      // N-06: every leaf bar has its name printed, inside (fits) or right of the bar
      const leafNames = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-row]")).map((r) => {
        const name = r.querySelector("[data-plan-name]")?.getAttribute("title") ?? ""
        const cells = r.querySelectorAll('[role="cell"]')
        const timeline = cells[cells.length - 1]
        return { name, printed: (timeline?.textContent ?? "").includes(name) }
      })
      return { tableWidth: Math.round(table.getBoundingClientRect().width), chartScrollW: c.scrollWidth, chartClientW: c.clientWidth, bars: bars.length, clipped, today: !!document.querySelector("[data-plan-today]"), scaleLabels: top, wrappedScale, cutScale, leafNames }
    })
    console.log(`print ${scope}:`, JSON.stringify(info))
    expect(info.wrappedScale).toEqual([])
    expect(info.cutScale).toEqual([])
    const unprinted = info.leafNames.filter((n) => !n.printed).map((n) => n.name)
    console.log(`print ${scope} rows without a printed name (summary rows expected):`, JSON.stringify(unprinted))
    await page.screenshot({ path: `${SHOTS}/c2-F04-print-${scope}.png`, fullPage: true })
    await page.pdf({ path: `${SHOTS}/c2-F04-print-${scope}.pdf`, format: "A4", landscape: true, printBackground: true })
    expect(info.chartScrollW).toBeLessThanOrEqual(info.chartClientW + 1)
    await page.emulateMedia({ media: "screen" })
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
  }
  report("print", issues)
  await ctx.close()
})

test("F-05 today pill vs month/year label; F-10 today line under sticky grid", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", vp(1440))
  for (const z of ["day", "week", "month", "quarter"]) {
    await gotoPlan(page, `?zoom=${z}`)
    await page.getByRole("button", { name: "今日へ" }).click()
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const pill = document.querySelector("[data-plan-today-label]")!.getBoundingClientRect()
      const spans = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-chart] span.truncate")).filter((s) => {
        const b = s.getBoundingClientRect()
        return b.top < pill.bottom && b.bottom > pill.top && b.width > 0
      })
      const hits = spans.filter((s) => {
        const b = s.getBoundingClientRect()
        return Math.min(b.right, pill.right) - Math.max(b.left, pill.left) > 1
      })
      return { pill: [Math.round(pill.left), Math.round(pill.right)], overlapped: hits.map((h) => h.textContent), tierLabels: spans.map((s) => s.textContent) }
    })
    console.log(`F-05 ${z}:`, JSON.stringify(r))
    const clip = await page.locator("[data-plan-today-label]").boundingBox()
    await page.screenshot({ path: `${SHOTS}/c2-F05-${z}.png`, clip: { x: Math.max(0, clip!.x - 250), y: clip!.y - 10, width: 500, height: 70 } })
    expect(r.overlapped).toEqual([])
  }
  // F-10: scroll so that today sits under the sticky grid
  await gotoPlan(page, "?zoom=week")
  await page.getByRole("button", { name: "今日へ" }).click()
  await page.evaluate(() => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement
    const t = document.querySelector("[data-plan-today]")!.getBoundingClientRect()
    const grid = (c.querySelector('[role="row"] > div') as HTMLElement).getBoundingClientRect()
    c.scrollLeft += t.left - (grid.left + grid.width / 2)
  })
  await page.waitForTimeout(300)
  const g = await page.locator('[data-plan-chart] [role="row"] > div').first().boundingBox()
  await page.screenshot({ path: `${SHOTS}/c2-F10-today-under-grid.png`, clip: { x: g!.x, y: g!.y, width: g!.width, height: 400 } })
  await ctx.close()
})

test("F-06 / F-07 en + id with all columns at 1440 and 1280", async ({ browser }) => {
  for (const lang of ["en", "id"] as const) {
    for (const w of [1440, 1280]) {
      const { ctx, page } = await userPage(browser, "po", vp(w))
      await page.goto("/")
      expect((await api(page, "PATCH", "/api/user/language", { language: lang })).status).toBeLessThan(300)
      await gotoPlan(page)
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ columns: ["period", "start", "end", "duration", "progress", "owner", "status"] })), `kanflow:plan:${PROJECT}`)
      await page.reload()
      await expect(page.locator("[data-plan-bar]").first()).toBeAttached({ timeout: 30_000 })
      await page.waitForTimeout(500)
      const m = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-plan-chart] [role="cell"], [data-plan-chart] [role="columnheader"]'))
        const wrapped = cells.filter((c) => c.getBoundingClientRect().height > 0 && c.scrollHeight > c.clientHeight + 2).map((c) => c.textContent?.slice(0, 30))
        const truncated = cells.filter((c) => {
          const t = c.querySelector(".truncate") as HTMLElement | null
          return t ? t.scrollWidth > t.clientWidth + 1 : false
        }).map((c) => c.textContent?.slice(0, 30))
        const c = document.querySelector("[data-plan-chart]") as HTMLElement
        const grid = (c.querySelector('[role="row"] > div') as HTMLElement).getBoundingClientRect().width
        const name = (c.querySelector("[role=columnheader]") as HTMLElement).getBoundingClientRect().width
        return { lang: document.documentElement.lang, wrapped: [...new Set(wrapped)].slice(0, 10), truncated: [...new Set(truncated)].slice(0, 15), truncatedCount: truncated.length, grid: Math.round(grid), name: Math.round(name), chart: Math.round(c.clientWidth) }
      })
      console.log(`F-06 ${lang} ${w}:`, JSON.stringify(m))
      await page.screenshot({ path: `${SHOTS}/c2-F06-${lang}-${w}-allcols.png` })
      expect(m.wrapped).toEqual([])
      // N-03: names stay legible (≥ 160px) with every column chosen; the timeline keeps ≥ 200px
      expect(m.name).toBeGreaterThanOrEqual(160)
      expect(m.chart - m.grid).toBeGreaterThanOrEqual(199)
      const sep = page.getByRole("separator", { name: /Table width|Lebar tabel/ })
      expect(Number(await sep.getAttribute("aria-valuemax"))).toBeGreaterThanOrEqual(160)
      await page.evaluate((key) => localStorage.removeItem(key), `kanflow:plan:${PROJECT}`)
      await api(page, "PATCH", "/api/user/language", { language: "ja" })
      await ctx.close()
    }
  }
  // F-07 names-only: does the name column widen?
  const { ctx, page } = await userPage(browser, "po", vp(1440))
  await gotoPlan(page)
  const nameW = () => page.locator("[data-plan-chart] [role=columnheader]").first().evaluate((e) => Math.round(e.getBoundingClientRect().width))
  const w0 = await nameW()
  await page.getByRole("button", { name: "表を名前だけにする" }).click()
  const w1 = await nameW()
  const sep = page.getByRole("separator", { name: "表の幅" })
  console.log("F-07 name width normal / names-only:", w0, w1, "splitter max", await sep.getAttribute("aria-valuemax"))
  await page.screenshot({ path: `${SHOTS}/c2-F07-names-only-1440.png` })
  await page.getByRole("button", { name: "表の列を表示" }).click()
  await page.evaluate((key) => localStorage.removeItem(key), `kanflow:plan:${PROJECT}`)
  await ctx.close()
})

test("F-14 legend + F-16 nothing clipped at the chart's right edge", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", vp(1440))
  await page.goto("/")
  const plan2 = await getPlan(page, PROJECT2)
  // an item at the far end of the range with a slipped baseline and a milestone with a long name
  const s = stamp()
  const lastEnd = plan2.items.reduce((m, i) => (i.plannedEnd > m ? i.plannedEnd : m), plan2.today)
  const it = await createItem(page, { name: `E2E-Z${s} 端のバー`, plannedStart: lastEnd, plannedEnd: lastEnd }, PROJECT2)
  const ms = await createItem(page, { name: `E2E-Z${s} とても長い名前の最終マイルストーン（リリース判定会議）`, plannedStart: lastEnd, plannedEnd: lastEnd, isMilestone: true }, PROJECT2)
  for (const z of ["day", "week", "quarter"]) {
    await gotoPlan(page, `?zoom=${z}`, PROJECT2)
    await expect(bar(page, ms.id)).toBeAttached()
    await page.locator("[data-plan-chart]").evaluate((c) => { c.scrollLeft = c.scrollWidth })
    await page.waitForTimeout(300)
    const clipped = await page.evaluate(() => {
      const c = document.querySelector("[data-plan-chart]") as HTMLElement
      const cr = c.getBoundingClientRect()
      const contentRight = cr.left - c.scrollLeft + c.scrollWidth
      return Array.from(c.querySelectorAll<HTMLElement>('[role="row"] [role="cell"] *'))
        .filter((e) => e.children.length === 0 && (e.textContent ?? "").trim() && e.getBoundingClientRect().right > contentRight + 1)
        .map((e) => e.textContent?.slice(0, 40))
    })
    console.log(`F-16 ${z} clipped at right:`, JSON.stringify(clipped))
    await page.screenshot({ path: `${SHOTS}/c2-F16-right-edge-${z}.png` })
  }
  const legend = await page.getByText(/スプリント/).first().evaluate((e) => e.closest("div")?.parentElement?.textContent?.slice(0, 200))
  console.log("legend:", legend)
  await deleteItem(page, ms.id, PROJECT2)
  await deleteItem(page, it.id, PROJECT2)
  await ctx.close()
})

test("F-09 calendar 375 overflow", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", vp(375))
  await page.goto(`/projects/${PROJECT}/calendar`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log("calendar 375 overflow:", o)
  await page.screenshot({ path: `${SHOTS}/c2-F09-calendar-375.png` })
  expect(o).toBeLessThanOrEqual(0)
  await ctx.close()
})

test("F-10 recheck: today line under the sticky grid at day zoom (ZEVA)", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  for (const z of ["day", "week"]) {
    await gotoPlan(page, `?zoom=${z}`, PROJECT2)
    await page.locator("[data-plan-chart]").evaluate((c) => { c.scrollLeft = c.scrollWidth })
    await page.waitForTimeout(300)
    const info = await page.evaluate(() => {
      const t = document.querySelector("[data-plan-today]")!.getBoundingClientRect()
      const grid = (document.querySelector('[data-plan-chart] [role="row"] > div') as HTMLElement).getBoundingClientRect()
      const arrows = document.querySelectorAll("[data-plan-arrow]").length
      const row = document.querySelector("[data-plan-row]") as HTMLElement
      const rowCell = row.firstElementChild as HTMLElement
      // F-10: every sticky grid cell covers its row's bottom border line, is opaque and above the decorations
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-row]"))
      const uncovered = rows.filter((r) => {
        const cell = r.firstElementChild as HTMLElement
        const cs = getComputedStyle(cell)
        const bg = cs.backgroundColor
        const opaque = !/rgba\(.*,\s*0(\.\d+)?\)$/.test(bg) && bg !== "transparent"
        return cell.getBoundingClientRect().bottom < r.getBoundingClientRect().bottom - 0.5 || !opaque || !(Number(cs.zIndex) > 0)
      }).length
      return { todayX: Math.round(t.left), gridLeft: Math.round(grid.left), gridRight: Math.round(grid.right), arrows, rowBorder: getComputedStyle(row).borderBottomColor, stickyBg: getComputedStyle(rowCell).backgroundColor, uncovered }
    })
    console.log(`F-10 ${z}:`, JSON.stringify(info))
    expect(info.uncovered).toBe(0)
    const g = await page.locator('[data-plan-chart] [role="row"] > div').first().boundingBox()
    await page.screenshot({ path: `${SHOTS}/c2-F10-zeva-${z}.png`, clip: { x: g!.x, y: g!.y - 10, width: g!.width, height: 220 } })
  }
  await ctx.close()
})

// N-01 (fixed in cycle 2): the row menu is portaled to <body> and flips upward near the bottom.
test("row … menu near the bottom of the chart is not clipped", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", vp(1440))
  await gotoPlan(page)
  const plan = await getPlan(page)
  const rows = page.locator("[data-plan-row]")
  const last = rows.last()
  await last.hover()
  console.log("rows:", plan.items.length)
  await last.getByRole("button", { name: /の操作$/ }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  const res = await menu.getByRole("menuitem").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { t: e.textContent, top: Math.round(r.top), reachable: !!hit && (hit === e || e.contains(hit)) }
    }),
  )
  const chartBottom = await page.locator("[data-plan-chart]").evaluate((c) => Math.round(c.getBoundingClientRect().bottom))
  const portaled = await menu.evaluate((m) => !m.closest("[data-plan-chart]"))
  console.log("menu items:", JSON.stringify(res), "chartBottom", chartBottom, "portaled", portaled)
  await page.screenshot({ path: `${SHOTS}/c2-row-menu-bottom.png` })
  expect(portaled).toBe(true)
  expect(res.filter((r) => !r.reachable)).toEqual([])
  const box = (await menu.boundingBox())!
  const vh = page.viewportSize()!.height
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(vh)
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  // the same at 375 (touch): still fully reachable
  await page.setViewportSize({ width: 375, height: 700 })
  await page.waitForTimeout(300)
  await rows.last().getByRole("button", { name: /の操作$/ }).click()
  const small = await page.getByRole("menu").boundingBox()
  console.log("menu at 375:", JSON.stringify(small))
  expect(small!.x).toBeGreaterThanOrEqual(0)
  expect(small!.x + small!.width).toBeLessThanOrEqual(375)
  expect(small!.y + small!.height).toBeLessThanOrEqual(700)
  await page.keyboard.press("Escape")
  await ctx.close()
})

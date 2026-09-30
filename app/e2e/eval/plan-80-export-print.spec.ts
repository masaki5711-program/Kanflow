import ExcelJS from "exceljs"
import { expect, test } from "@playwright/test"
import { SHOTS, bar, createItem, deleteItem, getPlan, gotoPlan, patchItem, report, stamp, userPage, type Item } from "./plan-support"

/** Excel export (validated with exceljs) and print preview. */

let s = ""
let root: Item, child: Item, ms: Item

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  s = stamp()
  root = await createItem(page, { name: `E2E-X${s} 出力親`, plannedStart: "2026-10-01", plannedEnd: "2026-10-09" })
  child = await createItem(page, { name: `E2E-X${s} 出力子`, parentId: root.id, plannedStart: "2026-10-01", plannedEnd: "2026-10-09" })
  ms = await createItem(page, { name: `E2E-X${s} 出力MS`, parentId: root.id, plannedStart: "2026-10-09", plannedEnd: "2026-10-09", isMilestone: true })
  await patchItem(page, child.id, { status: "in_progress" })
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  await deleteItem(page, root.id)
  await ctx.close()
})

test("export xlsx: hierarchy, dates, statuses", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  await page.getByRole("button", { name: "その他の操作" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "エクスポート" }).click()])
  const file = `${SHOTS}/80-plan-export.xlsx`
  await download.saveAs(file)
  const fileName = download.suggestedFilename()
  console.log("download filename:", fileName)
  // F-13: never cut inside a bracket
  expect((fileName.match(/\(/g) ?? []).length).toBe((fileName.match(/\)/g) ?? []).length)
  expect(fileName).not.toMatch(/_{2,}/)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  console.log("sheet:", ws.name, "rows:", ws.rowCount)
  const rows: string[][] = []
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v && typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result) : String(v ?? "")))))
  console.log("header:", JSON.stringify(rows[0]))
  for (const r of rows.slice(0, 4)) console.log("row:", JSON.stringify(r))
  const mine = rows.filter((r) => r.some((c) => c.includes(`E2E-X${s}`)))
  for (const r of mine) console.log("mine:", JSON.stringify(r))
  expect(mine.length).toBe(3)
  const header = rows[0]
  const col = (name: string) => header.indexOf(name)
  const pr = mine.find((r) => r[col("項目")].includes("出力親"))!
  const cr = mine.find((r) => r[col("項目")].includes("出力子"))!
  const mr = mine.find((r) => r[col("項目")].includes("出力MS"))!
  // hierarchy: WBS n / n.1, child name indented
  expect(cr[col("WBS")].startsWith(pr[col("WBS")] + ".")).toBeTruthy()
  console.log("child name cell raw:", JSON.stringify(cr[col("項目")]))
  expect(cr[col("計画開始")]).toContain("2026-10-01")
  expect(cr[col("計画終了")]).toContain("2026-10-09")
  // F-13: real Excel dates (Date cells with a date format) and the screen's terms
  const dateCell = ws.getRow(rows.indexOf(cr) + 1).getCell(col("計画開始") + 1)
  expect(dateCell.value instanceof Date).toBe(true)
  expect(dateCell.numFmt).toBe("yyyy-mm-dd")
  expect(header).toEqual(expect.arrayContaining(["基準線（開始）", "基準線（終了）"]))
  expect(header.some((h) => h.includes("ベースライン"))).toBe(false)
  expect(cr[col("ステータス")]).toBe("進行中")
  expect(mr[col("マイルストーン")]).toBe("◆")
  expect(pr[col("進捗 (%)")]).toBe("50")
  // total row count = plan items + header
  expect(rows.length - 1).toBe((await getPlan(page)).items.length)
  report("export", issues)
  await ctx.close()
})

test("export in en / id language", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  for (const lang of ["en", "id"]) {
    const res = await page.request.get(`http://localhost:3100/api/projects/cmr8tnrzm0000m09lghm5jshr/plan/export?lang=${lang}`)
    expect(res.status()).toBe(200)
    console.log(lang, res.headers()["content-type"], res.headers()["content-disposition"])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await res.body()) as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String)
    console.log(lang, "sheet:", ws.name, "header:", JSON.stringify(header))
    if (lang === "id") expect(header).toEqual(expect.arrayContaining(["Tonggak", "Garis dasar (mulai)"]))
  }
  await ctx.close()
})

test("print: range dialog, page-fitted layout with today and October (F-04)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  // The dialog offers the visible period or the whole plan; the browser dialog is stubbed.
  await page.evaluate(() => {
    ;(window as unknown as { __printed: number }).__printed = 0
    window.print = () => {
      ;(window as unknown as { __printed: number }).__printed += 1
    }
  })
  await page.getByRole("button", { name: "その他の操作" }).click()
  await page.getByRole("menuitem", { name: "印刷" }).click()
  const dlg = page.getByRole("dialog", { name: "印刷" })
  await expect(dlg.getByRole("radio", { name: /表示中の期間/ })).toBeVisible()
  await expect(dlg.getByRole("radio", { name: /全期間/ })).toBeChecked()
  await dlg.getByRole("button", { name: "印刷する" }).click()
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  await page.emulateMedia({ media: "print" })
  await page.waitForTimeout(300)
  const fit = await page.evaluate(() => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement
    const table = c.querySelector('[role="table"]') as HTMLElement
    return { tableWidth: table.getBoundingClientRect().width, today: !!document.querySelector("[data-plan-today]") }
  })
  console.log("print layout", JSON.stringify(fit))
  expect(fit.today).toBe(true)
  expect(fit.tableWidth).toBeLessThanOrEqual(1001)
  await expect(bar(page, child.id)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/81-print-preview.png`, fullPage: true })
  const hidden = await page.locator("[data-plan-print-hide]").first().isVisible()
  console.log("toolbar visible in print:", hidden)
  const pdf = await page.pdf({ path: `${SHOTS}/81-print.pdf`, format: "A4", landscape: true, printBackground: true })
  console.log("pdf bytes:", pdf.length)
  await page.emulateMedia({ media: "screen" })
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")))
  await expect(page.getByRole("separator", { name: "表の幅" })).toBeVisible()
  report("print", issues)
  await ctx.close()
})

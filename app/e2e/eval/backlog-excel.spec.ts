import { expect, test, type Page } from "@playwright/test"
import ExcelJS from "exceljs"
import fs from "node:fs"
import path from "node:path"
import { api, BACKLOG, gotoBacklog, login, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })
const TMP = path.resolve("test-results-backlog/xlsx")

async function readWb(file: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb
}
function headerMap(ws: ExcelJS.Worksheet): Record<string, number> {
  const out: Record<string, number> = {}
  ws.getRow(1).eachCell((c, col) => (out[String(c.value)] = col))
  return out
}
async function openImport(page: Page) {
  await page.getByRole("button", { name: "Excel 取込" }).click()
  const dlg = page.getByRole("dialog", { name: "Excel からバックログを取り込む" })
  await expect(dlg).toBeVisible()
  return dlg
}

test("export downloads a valid xlsx", async ({ page }) => {
  fs.mkdirSync(TMP, { recursive: true })
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const dl = page.waitForEvent("download")
  await page.getByRole("link", { name: "Excel 出力" }).click()
  const d = await dl
  const file = path.join(TMP, "export.xlsx")
  await d.saveAs(file)
  console.log("export filename", d.suggestedFilename())
  const wb = await readWb(file)
  console.log("sheets", wb.worksheets.map((w) => `${w.name}(${w.rowCount})`))
  const ws = wb.getWorksheet("バックログ")!
  expect(ws).toBeTruthy()
  console.log("headers", Object.keys(headerMap(ws)))
  const list = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
  const b = (list.body.data ?? list.body) as Record<string, unknown[]>
  const total = b.readyItems.length + b.notReadyItems.length + b.completedItems.length
  console.log("rows", ws.rowCount - 1, "api total", total)
  expect(ws.rowCount - 1).toBe(total)
  // export while filtered: does it follow the filter (hint says 表示中のデータ)?
  await page.goto(`${BACKLOG}?status=ready`)
  const href = await page.getByRole("link", { name: "Excel 出力" }).getAttribute("href")
  const title = await page.getByRole("link", { name: "Excel 出力" }).getAttribute("title")
  console.log("export href while filtered", href, "title", title)
  // EN / ID language export headers
  const idRes = await page.request.get(`/api/projects/${PROJECT}/backlog/export?lang=id`)
  console.log("id export", idRes.status(), idRes.headers()["content-type"], idRes.headers()["content-disposition"])
  report("export", issues)
})

test("import: template, dry-run with invalid row, then valid commit", async ({ page }) => {
  fs.mkdirSync(TMP, { recursive: true })
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-XLS-${stamp()}`
  const upd = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: `${tag}-UPD`, userStory: "E2E として取込更新を確認したい。", workloadScore: 1 })
  const updPbi = (upd.body.data ?? upd.body) as { id: string; displayId: number }

  let dlg = await openImport(page)
  await page.screenshot({ path: `${SHOTS}/excel-import-dialog.png` })
  const dl = page.waitForEvent("download")
  await dlg.getByRole("link", { name: "テンプレートをダウンロード" }).click()
  const tplFile = path.join(TMP, "template.xlsx")
  await (await dl).saveAs(tplFile)
  const tpl = await readWb(tplFile)
  console.log("template sheets", tpl.worksheets.map((w) => `${w.name}(${w.rowCount})`))
  const ws = tpl.worksheets[0]
  const h = headerMap(ws)
  console.log("template headers", h)
  const col = (re: RegExp) => Object.entries(h).find(([k]) => re.test(k))?.[1]
  const cId = col(/^ID$/)!, cInit = col(/イニシアティブ/)!, cStory = col(/^ユーザーストーリー/)!, cStatus = col(/ステータス/)!, cPts = col(/工数|ポイント/)!
  // clear example rows
  for (let r = ws.rowCount; r >= 2; r--) ws.spliceRows(r, 1)
  const addRow = (vals: Record<number, unknown>) => {
    const row = ws.addRow([])
    for (const [c, v] of Object.entries(vals)) row.getCell(Number(c)).value = v as ExcelJS.CellValue
  }
  addRow({ [cInit]: `${tag}-NEW1`, [cStory]: "E2E として取込1を確認したい。", [cStatus]: "着手可能", [cPts]: 3 })
  addRow({ [cInit]: `${tag}-BAD`, [cStory]: "E2E 不正行", [cStatus]: "bogus", [cPts]: -1 })
  addRow({ [cId]: 99999, [cInit]: `${tag}-MISSING` })
  const badFile = path.join(TMP, "bad.xlsx")
  await tpl.xlsx.writeFile(badFile)

  await dlg.locator("input[type=file]").setInputFiles(badFile)
  await dlg.getByRole("button", { name: "内容を確認" }).click()
  await expect(dlg.getByText(/追加 \d+ 件・更新 \d+ 件・変更なし \d+ 件・エラー \d+ 件/)).toBeVisible()
  console.log("DRY-RUN (bad):\n" + (await dlg.innerText()))
  await page.screenshot({ path: `${SHOTS}/excel-import-errors.png` })
  await expect(dlg.getByRole("button", { name: "取り込む" })).toBeDisabled()
  await dlg.getByRole("button", { name: "ファイルを選び直す" }).click()

  // valid file (fresh sheet with the template header row)
  for (let r = ws.rowCount; r >= 2; r--) ws.getRow(r).values = []
  ws.getRow(2).values = []
  const good = new ExcelJS.Workbook()
  const gws = good.addWorksheet(ws.name)
  gws.addRow(ws.getRow(1).values as ExcelJS.CellValue[])
  const addGood = (vals: Record<number, unknown>) => {
    const row = gws.addRow([])
    for (const [c, v] of Object.entries(vals)) row.getCell(Number(c)).value = v as ExcelJS.CellValue
  }
  addGood({ [cInit]: `${tag}-NEW1`, [cStory]: "E2E として取込1を確認したい。", [cStatus]: "着手可能", [cPts]: 3 })
  addGood({ [cInit]: `${tag}-NEW2`, [cStory]: "E2E として取込2を確認したい。", [cPts]: 2 })
  addGood({ [cId]: updPbi.displayId, [cStory]: "E2E 取込で更新されたストーリー", [cStatus]: "ready" })
  const goodFile = path.join(TMP, "good.xlsx")
  await good.xlsx.writeFile(goodFile)
  await dlg.locator("input[type=file]").setInputFiles(goodFile)
  await dlg.getByRole("button", { name: "内容を確認" }).click()
  await expect(dlg.getByText("追加 2 件・更新 1 件・変更なし 0 件・エラー 0 件")).toBeVisible()
  console.log("DRY-RUN (good):\n" + (await dlg.innerText()))
  await page.screenshot({ path: `${SHOTS}/excel-import-preview-ok.png` })
  // nothing written by dry run
  const pre = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${updPbi.id}`)
  expect(((pre.body.data ?? pre.body) as Record<string, unknown>).status).toBe("not_ready")
  await dlg.getByRole("button", { name: "取り込む" }).click()
  await expect(page.getByText("2 件を追加し、1 件を更新しました")).toBeVisible()
  await expect(dlg).toHaveCount(0)
  await page.goto(`${BACKLOG}?q=${tag}`)
  await expect(page.locator("[data-dnd-row]")).toHaveCount(3)
  const post = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${updPbi.id}`)
  const pb = (post.body.data ?? post.body) as Record<string, unknown>
  console.log("updated pbi", pb.status, pb.userStory, pb.initiative)
  expect(pb.status).toBe("ready")
  expect(pb.initiative).toBe(`${tag}-UPD`)
  // history entry for import update
  await page.goto(`${BACKLOG}?pbi=${updPbi.displayId}`)
  await page.getByRole("dialog").getByRole("tab", { name: "履歴" }).click()
  console.log("history after import:", (await page.getByRole("dialog").getByRole("region", { name: "履歴" }).innerText()).slice(0, 300))
  // non-xlsx file
  await page.keyboard.press("Escape")
  dlg = await openImport(page)
  const txt = path.join(TMP, "not.xlsx")
  fs.writeFileSync(txt, "hello")
  await dlg.locator("input[type=file]").setInputFiles(txt)
  await dlg.getByRole("button", { name: "内容を確認" }).click()
  await page.waitForTimeout(1000)
  console.log("garbage file:", (await dlg.innerText()).slice(0, 400))
  await page.screenshot({ path: `${SHOTS}/excel-import-garbage.png` })
  // cleanup
  const list = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
  const b = (list.body.data ?? list.body) as Record<string, Array<{ id: string; initiative: string | null }>>
  const mine = [...b.readyItems, ...b.notReadyItems, ...b.completedItems].filter((i) => (i.initiative ?? "").startsWith(tag))
  await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: mine.map((i) => i.id) })
  report("import", issues)
})

test("import permission: dev gets 403 on template/import", async ({ page }) => {
  await login(page, "dev")
  await page.goto(BACKLOG)
  const tpl = await page.request.get(`/api/projects/${PROJECT}/backlog/import/template`)
  const exp = await page.request.get(`/api/projects/${PROJECT}/backlog/export`)
  console.log("dev template", tpl.status(), "export", exp.status())
  expect(tpl.status()).toBe(403)
  expect(exp.status()).toBe(200)
})

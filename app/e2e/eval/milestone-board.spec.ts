import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { api, login, SHOTS, stamp, watch, report, type Issues } from "./backlog-support"

/**
 * マイルストーン・検収ボード (general /releases): empty-state CTA, 設備導入
 * template loaded and pencilled in, stage dialog (完了条件 tick, dates), 検収
 * results to 検収完了, 残課題 with a pasted photo, 引き渡し資料, 予算, Excel;
 * then a 長期品質改善 project's 推移. Screenshots at 1440 and 375 px.
 * Creates its own general projects as e2e-po (eval DB only).
 */
test.describe.configure({ mode: "serial" })

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

let ctx: BrowserContext
let page: Page
let issues: Issues
let projectId = ""
const templates: Record<string, string> = {}
const data = <T>(body: Record<string, unknown>) => (body.data ?? body) as T

async function createGeneral(name: string): Promise<string> {
  const created = await api(page, "POST", "/api/projects", { name, projectType: "general" })
  expect(created.status).toBe(201)
  return data<{ id: string }>(created.body).id
}

async function applyTemplate(pid: string, key: string, start: string) {
  expect((await api(page, "POST", `/api/projects/${pid}/plan/templates/apply`, { templateId: templates[key] })).status).toBe(201)
  expect((await api(page, "POST", `/api/projects/${pid}/plan/schedule-from`, { startDate: start })).status).toBe(200)
}

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  page = await ctx.newPage()
  issues = watch(page)
  await login(page, "po")
  projectId = await createGeneral(`E2E 設備導入 ${stamp()}`)
  const list = data<Array<{ id: string; builtinKey: string | null }>>((await api(page, "GET", "/api/plan-templates")).body)
  for (const t of list) if (t.builtinKey) templates[t.builtinKey] = t.id
  expect(templates.equipment).toBeTruthy()
})

test.afterAll(async () => {
  report("milestone-board", issues)
  await ctx.close()
})

/** Save the stage form and wait for the plan PATCH (a stale 「保存しました」 may still be shown). */
async function savePlan(dlg: ReturnType<Page["getByRole"]>) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && /\/plan\/[^/]+$/.test(new URL(r.url()).pathname)),
    dlg.getByRole("button", { name: "保存", exact: true }).click(),
  ])
  expect(res.status()).toBe(200)
  await expect(dlg.getByRole("button", { name: "保存", exact: true })).toBeDisabled()
}

const boardUrl = (pid = projectId) => `/projects/${pid}/releases`
const heading = () => page.getByRole("heading", { level: 1, name: "マイルストーン・検収ボード" })

test("empty board offers the template CTA (opens the plan's load dialog)", async () => {
  await page.goto(boardUrl())
  await expect(heading()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("まだ工程がありません")).toBeVisible()
  await expect(page.getByRole("link", { name: "全体計画を開く" })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ms-empty-1440.png`, fullPage: true })
  await page.getByRole("main").getByRole("button", { name: "テンプレートを読み込む" }).click()
  const dlg = page.getByRole("dialog", { name: "テンプレートを読み込む" })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByText("設備導入").first()).toBeVisible()
  await dlg.getByRole("button", { name: "キャンセル" }).click()
})

test("設備導入 loaded: stage track, checks / documents seeded, budget on", async () => {
  await applyTemplate(projectId, "equipment", "2026-06-01")
  await page.goto(boardUrl())
  await expect(heading()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("テンプレート: 設備導入")).toBeVisible()
  const track = page.getByTestId("ms-stage-track")
  await expect(track.getByRole("button", { name: "仕様決定 の詳細を開く" })).toBeVisible()
  await expect(track.locator("[data-late]").first()).toBeVisible()
  await expect(page.getByRole("tab", { name: /検収 0\/3/ })).toBeVisible()
  await expect(page.getByRole("tab", { name: /予算/ })).toBeVisible()
  await expect(page.getByRole("tab", { name: /引き渡し資料 0\/5/ })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ms-board-1440.png`, fullPage: true })
})

test("stage dialog: tick a 完了条件 and set an actual date", async () => {
  await page.getByRole("button", { name: "仕様決定 の詳細を開く" }).click()
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("checkbox", { name: "仕様書承認済み" }).check()
  await expect(dlg.getByText("保存しました")).toBeVisible()
  await expect(dlg.getByRole("checkbox", { name: "仕様書承認済み" })).toBeChecked()
  await expect(dlg.getByText(/中の作業（全体計画の子項目）から自動/)).toBeVisible()
  await dlg.getByLabel("実績開始").fill("2026-06-03")
  await savePlan(dlg)
  await dlg.evaluate((el) => el.scrollTo(0, 0))
  await page.screenshot({ path: `${SHOTS}/ms-stage-1440.png` })
  await dlg.getByRole("button", { name: /閉じる|Close/ }).first().click()
  await expect(page.getByTestId("ms-stage-track").getByText("完了条件 1/1")).toBeVisible()
})

test("milestone stage: move its date (writes the plan item)", async () => {
  await page.getByRole("button", { name: "立会検収 の詳細を開く" }).click()
  const dlg = page.getByRole("dialog")
  await dlg.getByLabel("予定開始").fill("2026-12-10")
  await dlg.getByLabel("予定終了").fill("2026-12-10")
  await savePlan(dlg)
  await dlg.getByRole("button", { name: /閉じる|Close/ }).first().click()
  const plan = data<Array<{ name: string; plannedEnd: string | null }>>((await api(page, "GET", `/api/projects/${projectId}/plan`)).body)
  expect(JSON.stringify(plan)).toContain("2026-12-10")
})

test("record every 検収 check → 検収完了", async () => {
  await page.getByRole("tab", { name: /検収/ }).click()
  const rows = page.getByTestId("ms-check-row")
  await expect(rows).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    const row = rows.nth(i)
    await row.getByPlaceholder(/立会者/).fill("メーカー 山田様")
    await row.getByRole("button", { name: i === 2 ? "条件付き合格" : "合格", exact: true }).click()
    await expect(row.getByText("メーカー 山田様")).toBeVisible()
  }
  await expect(page.getByText(/すべての検収が合格しました/)).toBeVisible()
  await expect(page.getByTestId("ms-accepted")).toBeVisible()
})

test("残課題: quick add, paste a photo, set in progress", async () => {
  await page.getByRole("tab", { name: /残課題/ }).click()
  await page.getByTestId("ms-punch-quick-add").fill("安全カバーのボルト不足")
  await page.getByTestId("ms-punch-quick-add").press("Enter")
  const row = page.getByTestId("ms-punch-row").filter({ hasText: "安全カバーのボルト不足" })
  await expect(row).toBeVisible()
  await row.evaluate((el, png) => {
    const dt = new DataTransfer()
    dt.items.add(new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "image.png", { type: "image/png" }))
    el.querySelector("[data-testid^='ms-punch-photos-']")?.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }))
  }, PNG_1PX)
  await expect(row.locator("img")).toHaveCount(1, { timeout: 30_000 })
  await row.getByRole("button", { name: "対応中" }).click()
  await expect(row.getByRole("button", { name: "対応中" })).toHaveAttribute("aria-pressed", "true")
  await row.getByRole("button", { name: /を編集/ }).click()
  await row.getByLabel("期限").fill("2026-09-30")
  await row.getByRole("button", { name: "保存", exact: true }).click()
  await expect(row.getByText("期限切れ").first()).toBeVisible()
  await page.getByRole("button", { name: /期限切れ/ }).first().click()
  await expect(page.getByTestId("ms-punch-row")).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/ms-punch-1440.png`, fullPage: true })
})

test("引き渡し資料: mark received and attach a file", async () => {
  await page.getByRole("tab", { name: /引き渡し資料/ }).click()
  const row = page.getByTestId("ms-doc-row").filter({ hasText: "図面" })
  await row.getByRole("switch").click()
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  await row.locator("input[type=file]").setInputFiles({ name: "layout.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") })
  await expect(row.getByRole("link", { name: /layout\.pdf/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("tab", { name: /引き渡し資料 1\/5/ })).toBeVisible()
})

test("予算: add a line over budget", async () => {
  await page.getByRole("tab", { name: /予算/ }).click()
  await page.getByRole("tabpanel").getByLabel("項目").fill("設備本体")
  await page.getByRole("tabpanel").getByRole("button", { name: "項目を追加" }).click()
  await page.getByLabel("予算（設備本体）").fill("12,000,000")
  await page.getByLabel("予算（設備本体）").press("Enter")
  await expect(page.getByText("保存しました").first()).toBeVisible()
  await page.getByLabel("実績（設備本体）").fill("12500000")
  await page.getByLabel("実績（設備本体）").press("Enter")
  await expect(page.getByText(/500,000円 超過/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ms-budget-1440.png`, fullPage: true })
})

test("Excel export downloads", async () => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Excel/ }).click()])
  expect(download.suggestedFilename()).toMatch(/^milestones-.*\.xlsx$/)
  await download.saveAs(`${SHOTS}/../milestones-export.xlsx`)
})

test("375 px: board and stage dialog", async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(boardUrl())
  await expect(heading()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId("ms-stage-track")).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/ms-board-375.png`, fullPage: true })
  await page.getByRole("button", { name: "試運転 の詳細を開く" }).click()
  await expect(page.getByRole("dialog").getByText("完了条件").first()).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/ms-stage-375.png` })
  await page.getByRole("dialog").getByRole("button", { name: /閉じる|Close/ }).first().click()
  await page.setViewportSize({ width: 1440, height: 1000 })
})

test("長期品質改善: 推移 tab with a metric and monthly values", async () => {
  const pid = await createGeneral(`E2E 品質改善 ${stamp()}`)
  await applyTemplate(pid, "quality", "2026-05-01")
  await page.goto(boardUrl(pid))
  await expect(heading()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("tab", { name: /効果確認/ })).toBeVisible()
  await page.getByRole("tab", { name: "推移" }).click()
  const panel = page.getByRole("tabpanel")
  await panel.getByLabel("指標", { exact: true }).fill("不良率")
  await panel.getByLabel("単位").fill("%")
  await panel.getByLabel("改善前").fill("2.4")
  await panel.getByLabel("目標").fill("1.0")
  await panel.getByRole("button", { name: "指標を追加" }).click()
  const metric = page.getByTestId("ms-metric")
  await expect(metric).toBeVisible()
  for (const [month, value] of [["2026-07", "2.1"], ["2026-08", "1.6"], ["2026-09", "0.9"]]) {
    await metric.getByLabel("月（不良率）").fill(month)
    await metric.getByLabel("値（不良率）").fill(value)
    await metric.getByRole("button", { name: "記録" }).click()
    await expect(metric.getByText(new RegExp(`最新 .*`))).toBeVisible()
  }
  await expect(metric.getByText("目標達成")).toBeVisible()
  await expect(metric.getByRole("img", { name: "不良率 の月ごとの推移" })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/ms-trend-1440.png`, fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.screenshot({ path: `${SHOTS}/ms-trend-375.png`, fullPage: true })
})

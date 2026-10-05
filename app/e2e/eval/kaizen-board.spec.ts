import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { api, login, SHOTS, stamp, watch, report, type Issues } from "./backlog-support"

/**
 * 改善成果ボード (process_improvement /releases): board, effect edit, rollout,
 * 定着確認, photo paste, A3 Excel export; screenshots at 1440 and 375 px.
 * Creates its own process_improvement project as e2e-po (eval DB only).
 */
test.describe.configure({ mode: "serial" })

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

let ctx: BrowserContext
let page: Page
let issues: Issues
let projectId = ""
const ids: Record<string, string> = {}
const data = <T>(body: Record<string, unknown>) => (body.data ?? body) as T

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  page = await ctx.newPage()
  issues = watch(page)
  await login(page, "po")
  const tag = stamp()
  const created = await api(page, "POST", "/api/projects", { name: `E2E 改善ボード ${tag}`, projectType: "process_improvement" })
  expect(created.status).toBe(201)
  projectId = data<{ id: string }>(created.body).id
  const stories = ["段取り時間を短くする（治具の共通化）", "組立ラインの不良を減らす（ポカヨケ追加）", "部品棚の歩行距離を減らす"]
  const pbiIds: string[] = []
  for (const userStory of stories) {
    const r = await api(page, "POST", `/api/projects/${projectId}/backlog`, { initiative: `KZ-${tag}`, userStory, workloadScore: 1, status: "completed" })
    expect(r.status).toBe(201)
    pbiIds.push(data<{ id: string }>(r.body).id)
  }
  expect((await api(page, "POST", `/api/projects/${projectId}/releases/import`, { pbItemIds: pbiIds })).status).toBe(201)
  const board = data<{ items: Array<{ id: string; pbItem: { userStory: string } | null; userStory: string }> }>((await api(page, "GET", `/api/projects/${projectId}/improvements`)).body)
  for (const item of board.items) ids[(item.pbItem?.userStory ?? item.userStory).slice(0, 4)] = item.id
  // A second item already standardized and rolling out, for a fuller board.
  const second = ids["組立ライ"]
  expect((await api(page, "PATCH", `/api/projects/${projectId}/improvements/${second}`, {
    metricCategory: "quality", metricName: "不良率", metricUnit: "%", direction: "decrease",
    baselineValue: 2.4, targetValue: 1.0, resultValue: 0.8, annualEffectYen: 850000,
    manualLink: "https://intra.example/std/assembly-07", kaizenStage: "standardized",
  })).status).toBe(200)
  expect((await api(page, "PATCH", `/api/projects/${projectId}/improvements/${second}`, { kaizenStage: "deploying" })).status).toBe(200)
  await api(page, "POST", `/api/projects/${projectId}/improvements/${second}/rollouts`, { targetName: "YMMA 第1ライン" })
})

test.afterAll(async () => {
  report("kaizen-board", issues)
  await ctx.close()
})

const boardUrl = () => `/projects/${projectId}/releases`

test("board renders with the summary strip and stage columns", async () => {
  await page.goto(boardUrl())
  await expect(page.getByRole("heading", { level: 1, name: "改善成果ボード" })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("region", { name: /効果確認中/ })).toBeVisible()
  await expect(page.getByRole("region", { name: /横展開中/ }).getByText("組立ラインの不良を減らす（ポカヨケ追加）")).toBeVisible()
  await expect(page.getByText("850,000 円").first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/kaizen-board-1440.png`, fullPage: true })
})

test("edit the effect of an improvement", async () => {
  await page.getByRole("button", { name: /段取り時間を短くする.* の詳細を開く/ }).click()
  const dlg = page.getByRole("dialog")
  await expect(dlg.getByRole("region", { name: "効果" })).toBeVisible()
  const effect = dlg.getByRole("region", { name: "効果" })
  await effect.getByLabel("指標の種類").selectOption("time")
  await effect.getByLabel("指標名").fill("段取り時間")
  await effect.getByLabel("単位").fill("分")
  await effect.getByLabel("改善前").fill("60")
  await effect.getByLabel("目標").fill("30")
  await effect.getByLabel("改善後").fill("38")
  await effect.getByLabel("効果金額（円/年）").fill("1200000")
  await expect(effect.getByText("73%")).toBeVisible()
  await dlg.getByRole("button", { name: "保存", exact: true }).click()
  await expect(dlg.getByText("保存しました")).toBeVisible()
})

test("add a rollout target and mark it done", async () => {
  const rollout = page.getByRole("dialog").getByRole("region", { name: "横展開" })
  await rollout.getByLabel("横展開先").fill("第2ライン")
  await rollout.getByRole("button", { name: "追加" }).click()
  const status = rollout.getByRole("group", { name: "第2ライン の状況" })
  await expect(status).toBeVisible()
  await status.getByRole("button", { name: "完了" }).click()
  await expect(status.getByRole("button", { name: "完了" })).toHaveAttribute("aria-pressed", "true")
})

test("展開日 creates the checks; record a 定着確認", async () => {
  const dlg = page.getByRole("dialog")
  const checks = dlg.getByRole("region", { name: "定着確認" })
  await checks.getByLabel("展開日").fill("2026-08-15")
  await dlg.getByRole("button", { name: "保存", exact: true }).click()
  await expect(checks.locator('[data-check-kind="1m"]')).toBeVisible()
  await expect(checks.locator('[data-check-kind="1m"]').getByText("期限切れ")).toBeVisible()
  await checks.getByLabel("メモ（1 か月後）").fill("治具は全員使っている")
  await checks.locator('[data-check-kind="1m"]').getByRole("button", { name: "維持できている" }).click()
  await expect(dlg.getByText("定着確認を記録しました")).toBeVisible()
  await expect(checks.locator('[data-check-kind="1m"]').getByText(/に記録/)).toBeVisible()
})

test("paste a photo into 改善後 and standardize", async () => {
  const dlg = page.getByRole("dialog")
  await page.evaluate((png) => {
    const el = document.querySelector('[data-photo-phase="after"]') as HTMLElement
    const dt = new DataTransfer()
    dt.items.add(new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "image.png", { type: "image/png" }))
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }))
  }, PNG_1PX)
  await expect(dlg.locator('[data-photo-phase="after"] img')).toHaveCount(1, { timeout: 30_000 })
  await dlg.getByLabel("標準書リンク").fill("https://intra.example/std/setup-12")
  await dlg.getByRole("region", { name: "段階" }).getByRole("button", { name: "標準化済み" }).click()
  await expect(dlg.getByText("段階を「標準化済み」にしました")).toBeVisible()
  await dlg.evaluate((el) => el.scrollTo(0, 0))
  await page.screenshot({ path: `${SHOTS}/kaizen-dialog-1440.png` })
  await dlg.getByRole("button", { name: "キャンセル" }).click()
  await expect(page.getByRole("region", { name: /標準化済み/ }).getByText("段取り時間を短くする（治具の共通化）")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/kaizen-board-after-1440.png`, fullPage: true })
})

test("Excel export downloads the A3 report", async () => {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Excel/ }).click()])
  expect(download.suggestedFilename()).toMatch(/^kaizen-.*\.xlsx$/)
  await download.saveAs(`${SHOTS}/../kaizen-export.xlsx`)
})

test("375 px: board and dialog", async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(boardUrl())
  await expect(page.getByRole("heading", { level: 1, name: "改善成果ボード" })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("region", { name: "段階ごとの件数" })).toBeVisible()
  await expect(page.getByRole("button", { name: "改善バックログから取り込み" })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/kaizen-board-375.png`, fullPage: true })
  await page.getByRole("button", { name: /段取り時間を短くする.* の詳細を開く/ }).click()
  await expect(page.getByRole("dialog").getByRole("region", { name: "効果" })).toBeVisible()
  await page.waitForTimeout(500) // let the dialog's open transition finish before the screenshot
  await page.screenshot({ path: `${SHOTS}/kaizen-dialog-375.png` })
  await page.getByRole("dialog").getByRole("region", { name: "定着確認" }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/kaizen-dialog-checks-375.png` })
})

import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { api, login, newUserPage, report, SHOTS, stamp, watch, type Issues } from "./backlog-support"

/**
 * 計画テンプレート + 日程未定: load 設備導入 into a fresh "general" project's
 * 全体計画 (undated rows, no bars), 仮置き from a start date, duplicate-load
 * warning, edit + reset a built-in, save the plan as a template and see it
 * as another user. Screenshots at 1440 and 375 px. Eval DB only.
 */
test.describe.configure({ mode: "serial" })

let ctx: BrowserContext
let page: Page
let issues: Issues
let projectId = ""
const tag = stamp()
const savedName = `E2E 保存テンプレート ${tag}`
const data = <T>(body: Record<string, unknown>) => (body.data ?? body) as T
const undatedChips = () => page.locator("[data-plan-undated]")
const datedBars = () => page.locator("[data-plan-bar]:not([data-plan-undated])")

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await ctx.newPage()
  issues = watch(page)
  await login(page, "po")
  const created = await api(page, "POST", "/api/projects", { name: `E2E 設備導入 ${tag}`, projectType: "general" })
  expect(created.status).toBe(201)
  projectId = data<{ id: string }>(created.body).id
})

test.afterAll(async () => {
  report("plan-templates", issues)
  // Remove the templates this spec saved (earlier runs too) so the shared list stays readable.
  const list = data<Array<{ id: string; name: string; isMine: boolean }>>((await api(page, "GET", "/api/plan-templates")).body)
  for (const t of list.filter((x) => x.isMine && /^E2E 保存テンプレート /.test(x.name))) await api(page, "DELETE", `/api/plan-templates/${t.id}`)
  await ctx.close()
})

const planUrl = () => `/projects/${projectId}/plan`

test("load 設備導入 into an empty plan: undated rows, no bars", async () => {
  await page.goto(planUrl())
  await page.getByRole("button", { name: "テンプレートを読み込む" }).first().click({ timeout: 60_000 })
  const dlg = page.getByRole("dialog", { name: "テンプレートを読み込む" })
  await dlg.getByRole("button", { name: /設備導入/ }).click()
  await expect(dlg.getByRole("list", { name: "設備導入" })).toBeVisible()
  await expect(dlg.getByText("検収項目:")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/tpl-load-dialog-1440.png` })
  await dlg.getByTestId("tpl-load-submit").click()
  await expect(page.getByText(/「設備導入」を読み込みました/)).toBeVisible()
  await expect(page.getByTitle("仕様決定", { exact: true })).toBeVisible()
  await expect(undatedChips().first()).toBeVisible()
  expect(await undatedChips().count()).toBeGreaterThan(8)
  await expect(datedBars()).toHaveCount(0)
  await expect(page.getByTestId("tpl-schedule-banner")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/tpl-plan-undated-1440.png`, fullPage: true })
})

test("仮置き fills dates sequentially from a start date", async () => {
  await page.getByTestId("tpl-schedule-banner").getByRole("button", { name: "日程を仮置き" }).click()
  const dlg = page.getByRole("dialog", { name: "開始日を入れて日程を仮置き" })
  await dlg.getByLabel("開始日").fill("2026-11-02")
  await dlg.getByTestId("tpl-schedule-submit").click()
  await expect(page.getByText(/項目に日程を仮置きしました/)).toBeVisible()
  await expect(undatedChips()).toHaveCount(0, { timeout: 20_000 })
  expect(await datedBars().count()).toBeGreaterThan(8)
  const plan = data<{ items: Array<{ name: string; plannedStart: string | null; plannedEnd: string | null }> }>((await api(page, "GET", `/api/projects/${projectId}/plan`)).body)
  const byName = new Map(plan.items.map((i) => [i.name, i]))
  expect(byName.get("要求仕様の整理")).toMatchObject({ plannedStart: "2026-11-02", plannedEnd: "2026-11-08" })
  expect(byName.get("仕様決定")?.plannedStart).toBe("2026-11-02")
  await page.screenshot({ path: `${SHOTS}/tpl-plan-scheduled-1440.png`, fullPage: true })
})

test("loading the same template again warns but is allowed", async () => {
  await page.getByTestId("plan-load-template").click()
  const dlg = page.getByRole("dialog", { name: "テンプレートを読み込む" })
  await dlg.getByRole("button", { name: /設備導入/ }).click()
  await expect(dlg.getByTestId("tpl-already-applied")).toContainText("すでに読み込み済みです")
  await expect(dlg.getByTestId("tpl-load-submit")).toBeEnabled()
  await dlg.getByRole("button", { name: "キャンセル" }).click()
})

test("edit a built-in template, see the history, then reset it to the default", async () => {
  await page.goto("/templates")
  await expect(page.getByRole("heading", { level: 1, name: "計画テンプレート" })).toBeVisible({ timeout: 60_000 })
  await expect(page.locator("[data-template-card]").first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/tpl-library-1440.png`, fullPage: true })
  await page.locator("[data-template-card]").filter({ hasText: "汎用" }).click()
  await expect(page.getByTestId("tpl-name")).toHaveValue("汎用", { timeout: 60_000 })
  await page.getByTestId("tpl-add-stage").click()
  await page.keyboard.type(`検証用工程 ${tag}`)
  await page.getByTestId("tpl-save").click()
  await expect(page.getByText("テンプレートを保存しました")).toBeVisible()
  await expect(page.getByTestId("tpl-history")).toContainText("編集")
  await page.screenshot({ path: `${SHOTS}/tpl-editor-1440.png`, fullPage: true })
  await page.getByTestId("tpl-reset").click()
  await page.getByRole("alertdialog").getByRole("button", { name: "デフォルトに戻す" }).click()
  await expect(page.getByText("デフォルトに戻しました")).toBeVisible()
  await expect(page.locator(`input[value="検証用工程 ${tag}"]`)).toHaveCount(0)
  await expect(page.getByTestId("tpl-history")).toContainText("デフォルトに戻す")
})

test("save the project's plan as a template; another user sees it under みんなのテンプレート", async ({ browser }) => {
  await page.goto(planUrl())
  await page.getByRole("button", { name: "その他の操作" }).click({ timeout: 60_000 })
  await page.getByRole("menuitem", { name: "この計画をテンプレートとして保存" }).click()
  const dlg = page.getByRole("dialog", { name: "この計画をテンプレートとして保存" })
  await dlg.getByLabel("テンプレート名").fill(savedName)
  await dlg.getByTestId("tpl-save-submit").click()
  await expect(page.getByText(`テンプレート「${savedName}」を保存しました`)).toBeVisible()

  const dev = await newUserPage(browser, "dev")
  await dev.page.setViewportSize({ width: 1440, height: 1000 })
  await dev.page.goto("/templates")
  // The dev account may use another UI language (its saved preference).
  const shared = dev.page.getByRole("region", { name: /みんなのテンプレート|Shared templates|Templat bersama/ })
  await expect(shared.getByText(savedName)).toBeVisible({ timeout: 60_000 })
  await dev.page.screenshot({ path: `${SHOTS}/tpl-library-as-dev-1440.png`, fullPage: true })
  // dev may edit (shared) but not delete someone else's template.
  await shared.locator("[data-template-card]").filter({ hasText: savedName }).click()
  await expect(dev.page.getByTestId("tpl-name")).toHaveValue(savedName, { timeout: 60_000 })
  await expect(dev.page.getByRole("button", { name: /^(削除|Delete|Hapus)$/ })).toHaveCount(0)
  report("plan-templates-dev", dev.issues)
  await dev.ctx.close()
})

test("phone (375 px): plan with undated rows, load dialog and editor", async () => {
  // A second load (汎用) leaves undated rows for the phone screenshots.
  const list = data<Array<{ id: string; builtinKey: string | null }>>((await api(page, "GET", "/api/plan-templates")).body)
  const generic = list.find((t) => t.builtinKey === "generic")
  expect(generic).toBeTruthy()
  expect((await api(page, "POST", `/api/projects/${projectId}/plan/templates/apply`, { templateId: generic?.id })).status).toBe(201)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(planUrl())
  await expect(undatedChips().first()).toBeAttached({ timeout: 60_000 })
  await page.screenshot({ path: `${SHOTS}/tpl-plan-375.png`, fullPage: true })
  await page.getByTestId("plan-load-template").click()
  const dlg = page.getByRole("dialog", { name: "テンプレートを読み込む" })
  await dlg.getByRole("button", { name: /建屋工事/ }).click()
  await expect(dlg.getByRole("list", { name: "建屋工事" })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/tpl-load-dialog-375.png`, fullPage: true })
  await dlg.getByRole("button", { name: "キャンセル" }).click()
  await page.goto("/templates/new")
  await expect(page.getByTestId("tpl-name")).toBeVisible({ timeout: 60_000 })
  await page.getByTestId("tpl-name").fill(`E2E 新規 ${tag}`)
  await page.screenshot({ path: `${SHOTS}/tpl-editor-375.png`, fullPage: true })
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(380)
})

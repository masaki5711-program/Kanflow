import { expect, test, type Page, type Route } from "@playwright/test"
import { login, PROJECT, SHOTS } from "./backlog-support"

/**
 * 「AI の参照資料として使う」 in the settings Git section (no LLM calls).
 *
 * 1. Real state: the trial specification repository is already imported —
 *    status line, 今すぐ取り込む, folder filter; switching off asks first and
 *    Cancel keeps everything (nothing is purged).
 * 2. Switching on, with the repository API routed (so the real index is not
 *    rebuilt): confirmation text about member visibility, PATCH body, status.
 * 3. A developer sees the status but no switch.
 */
test.describe.configure({ mode: "serial" })

const SETTINGS = `/projects/${PROJECT}/settings#git`
const GIT_API = `/api/projects/${PROJECT}/git`
const REPO_NAME = "仕様書（トライ）"

const repoRow = (page: Page) => page.locator("#git li").filter({ hasText: REPO_NAME })

async function openSettings(page: Page) {
  await page.goto(SETTINGS)
  await expect(repoRow(page)).toBeVisible({ timeout: 60_000 })
  await repoRow(page).scrollIntoViewIfNeeded()
}

test("imported repository: status, re-import and filter; switching off asks and Cancel keeps it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await login(page, "po")
  await openSettings(page)
  const row = repoRow(page)
  const toggle = row.getByRole("switch", { name: "AI の参照資料として使う" })
  await expect(toggle).toBeChecked()
  await expect(row.getByText(/AI の参照資料: \d+ ファイル・最終取り込み/)).toBeVisible()
  await expect(row.getByRole("button", { name: `「${REPO_NAME}」を今すぐ取り込む` })).toBeEnabled()
  await expect(row.getByLabel("取り込むフォルダ（任意）")).toBeVisible()
  await row.screenshot({ path: `${SHOTS}/kb-settings-on.png` })

  let patched = false
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/git/repositories/")) patched = true
  })
  await toggle.click()
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  await expect(dialog).toContainText("AI の参照資料をやめますか？")
  await expect(dialog).toContainText("取り込んだ内容はすぐに削除され")
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(toggle).toBeChecked()
  expect(patched).toBe(false)
})

test("switching on: confirmation explains member visibility, then the import starts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await login(page, "po")
  const real = (await (await page.request.get(GIT_API)).json()) as { repositories: Array<Record<string, unknown>> }
  const repo = real.repositories.find((r) => r.name === REPO_NAME)
  expect(repo).toBeTruthy()
  let state: Record<string, unknown> = { ...repo, aiKnowledge: false, indexedAt: null, indexedFiles: 0, indexing: false, indexPending: false }
  let patchBody: unknown = null
  // Routed: the real repository keeps its index (no re-import against GitLab from this spec).
  await page.route(`**${GIT_API}`, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue()
    await route.fulfill({ json: { ...real, repositories: real.repositories.map((r) => (r.id === state.id ? state : r)) } })
  })
  await page.route(`**${GIT_API}/repositories/${String(repo?.id)}`, async (route: Route) => {
    patchBody = route.request().postDataJSON()
    state = { ...state, aiKnowledge: true, indexing: true, indexPending: true }
    await route.fulfill({ json: state })
  })

  await openSettings(page)
  const row = repoRow(page)
  const toggle = row.getByRole("switch", { name: "AI の参照資料として使う" })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  await expect(dialog).toContainText(`「${REPO_NAME}」を AI の参照資料にしますか？`)
  await expect(dialog).toContainText("GitLab の権限がないメンバーも含め、このプロジェクトの全メンバーが AI を通じて内容を見られる")
  await page.screenshot({ path: `${SHOTS}/kb-settings-confirm.png` })
  await dialog.getByRole("button", { name: "参照資料にする" }).click()
  await expect.poll(() => patchBody).toEqual({ aiKnowledge: true })
  await expect(toggle).toBeChecked()
  await expect(row.getByText("取り込み中…")).toBeVisible()
  await expect(row.getByRole("button", { name: `「${REPO_NAME}」を今すぐ取り込む` })).toBeDisabled()
})

test("a developer sees the import status but cannot switch it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await login(page, "dev")
  await openSettings(page)
  const row = repoRow(page)
  // The e2e developer account uses Indonesian (ja / en / id texts accepted).
  await expect(row.getByText(/AI の参照資料: \d+ ファイル|AI reference: \d+ files|Referensi AI: \d+ file/)).toBeVisible()
  await expect(row.getByRole("switch")).toHaveCount(0)
  await expect(row.getByRole("textbox")).toHaveCount(0)
  await row.screenshot({ path: `${SHOTS}/kb-settings-dev-id.png` })
})

import { expect, test } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * GitLab development info on the eval env. Needs the eval-DB fixture rows
 * (git_integration on + "E2E fixture repo" links for the first two PBIs of the
 * active sprint); without them the project has Git off and nothing renders.
 */
const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
const PASSWORD = "E2e-Kanflow-2026!"

test.use({ locale: "ja-JP", viewport: { width: 1440, height: 900 } })
test.setTimeout(240_000)

test("開発 panel in the PBI detail and Git badges on the sprint board / backlog", async ({ page }) => {
  await loginViaUi(page, "e2e-po@example.test", PASSWORD)
  const summaryRequests: string[] = []
  page.on("request", (r) => { if (r.url().includes("/git/summary")) summaryRequests.push(r.url()) })

  // Sprint board: one summary request, badges on the cards.
  await page.goto(`/projects/${PROJECT}/sprints?view=board`)
  const badge = page.locator("[data-git-badge]").first()
  await expect(badge).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/マージリクエスト 2 件オープン、パイプライン: 失敗/).first()).toBeAttached()
  // Distinct URLs: `next dev` StrictMode runs every query effect twice.
  expect(new Set(summaryRequests).size).toBe(1)
  await page.screenshot({ path: `${SHOTS}/git-dev-sprint-board.png`, fullPage: false })

  // Backlog cards.
  await page.goto(`/projects/${PROJECT}/backlog`)
  await expect(page.locator("[data-git-badge]").first()).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: `${SHOTS}/git-dev-backlog.png`, fullPage: false })

  // PBI detail → 開発 panel (the fixture PBI with two open MRs).
  const backlog = (await (await page.request.get(`/api/projects/${PROJECT}/backlog`)).json()) as Record<string, Array<{ id: string; displayId: number }>>
  const items = [...(backlog.readyItems ?? []), ...(backlog.notReadyItems ?? []), ...(backlog.completedItems ?? [])]
  const summary = (await (await page.request.get(`/api/projects/${PROJECT}/git/summary?pbiIds=${items.map((i) => i.id).join(",")}`)).json()) as { summaries: Record<string, { openMrs: number }> }
  const target = items.find((i) => (summary.summaries[i.id]?.openMrs ?? 0) >= 2)
  expect(target).toBeTruthy()
  await page.goto(`/projects/${PROJECT}/backlog?pbi=${target!.displayId}`)
  const dialog = page.getByRole("dialog")
  const panel = dialog.getByRole("region", { name: "開発" })
  await expect(panel).toBeVisible({ timeout: 60_000 })
  await expect(panel.locator("[data-git-repository]")).toHaveCount(2)
  await expect(panel.getByText("オープン").first()).toBeVisible()
  await expect(panel.getByText("パイプライン: 失敗")).toBeVisible()
  await expect(panel.getByRole("button", { name: /さらに表示（残り 2 件）/ })).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: `${SHOTS}/git-dev-panel.png` })

  // Manual sync: the fixture repos are fake, so it reports a partial failure (still no crash).
  await panel.getByRole("button", { name: "今すぐ更新" }).click()
  await expect(page.getByText(/一部のリポジトリを更新できませんでした|少し前に更新したばかりです|GitLab の最新の情報を取り込みました/)).toBeVisible({ timeout: 60_000 })
})

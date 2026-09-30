import { expect, test } from "@playwright/test"
import * as fs from "node:fs"
import { open, snap, visit, flushErrs, PILOT, OUT, stamp } from "./accept-helpers"

/**
 * Acceptance cycle 3 — PO persona (ja), morning routine to sprint start.
 * Writes data (PBI, comment, plan item, baseline, project, sprint) and makes the
 * in-process translator call Ollama for every new text, so it only runs with
 * ACC_WRITE=1. Cycle 3 executed these exact steps once (driver scripts), which
 * created PBI #238, plan item "E2E-ACC 受入テスト計画項目" and project
 * "E2E-ACC-3 受入スプリント計画".
 */
test.describe.configure({ mode: "serial" })
test.setTimeout(300_000)
test.skip(process.env.ACC_WRITE !== "1", "writes data + triggers AI translation: set ACC_WRITE=1")

const P = `/projects/${PILOT}`
const TAG = `E2E-ACC-${stamp()}`

test("PO walkthrough", async ({ browser }) => {
  const s = await open(browser, "po", { lang: "ja", logFile: "po-walkthrough.log" })
  const { page } = s

  // 1. Morning check: home + notifications
  await visit(s, "/", "home")
  await page.getByRole("button", { name: /^通知/ }).first().click()
  await expect(page.getByRole("dialog", { name: "通知" })).toBeVisible()
  await snap(s, "w-po-notifications")
  await page.keyboard.press("Escape")

  // 2. Project dashboard
  await visit(s, P, "dashboard")
  await snap(s, "w-po-dashboard")

  // 3. Backlog grooming: filter, create, reorder, edit, comment with @mention
  await visit(s, `${P}/backlog`, "backlog")
  await page.getByRole("combobox", { name: "状態" }).selectOption({ label: "着手可能" })
  await expect(page).toHaveURL(/status=ready/)
  await page.getByRole("combobox", { name: "状態" }).selectOption({ index: 0 })
  await page.getByRole("button", { name: "PBI追加" }).click()
  const create = page.getByRole("dialog")
  await create.getByRole("textbox", { name: "イニシアティブ" }).fill(`${TAG} 受入テスト用PBI`)
  await create.getByRole("textbox", { name: "ユーザーストーリー" }).fill(`${TAG} POとして、受入テストの流れを確認したい。`)
  await create.getByRole("button", { name: "3", exact: true }).click()
  await create.getByRole("combobox", { name: "ステータス" }).selectOption({ label: "着手可能" })
  await create.getByRole("button", { name: "追加" }).click()
  const card = page.locator("li", { hasText: `${TAG} 受入テスト用PBI` }).first()
  await expect(card).toBeVisible()
  const handle = card.getByRole("button", { name: /を並べ替え/ })
  await handle.focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Space")
  await expect(page.locator("[role=status]").filter({ hasText: /番目に移動しました/ })).toBeVisible()

  await card.getByRole("button", { name: `${TAG} 受入テスト用PBI` }).click()
  const detail = page.getByRole("dialog")
  await detail.getByRole("button", { name: "編集" }).click()
  await detail.getByRole("textbox", { name: "エピック" }).fill(`${TAG} エピック`)
  await detail.getByRole("button", { name: "5", exact: true }).click()
  await detail.getByRole("button", { name: "更新" }).click()
  await expect(page.getByText("PBI を保存しました").first()).toBeVisible()
  await detail.getByRole("tab", { name: "コメント" }).click()
  const box = detail.getByRole("textbox", { name: "新しいコメント" })
  await box.click()
  await box.pressSequentially(`${TAG} 確認お願いします @E2E S`, { delay: 30 })
  await expect(page.getByRole("listbox")).toContainText("E2E SM")
  await page.keyboard.press("Enter")
  await box.pressSequentially(" と @E2E D", { delay: 30 })
  await page.keyboard.press("Enter")
  await detail.getByRole("button", { name: "送信" }).click()
  await expect(detail.getByRole("tab", { name: /コメント/ })).toContainText("1")
  await snap(s, "w-po-comment")
  await page.keyboard.press("Escape")

  // 4. Plan review: add item, link PBI, adjust dates, baseline, print
  await visit(s, `${P}/plan`, "plan")
  await page.getByRole("button", { name: "項目を追加" }).click()
  const add = page.getByRole("dialog")
  await add.getByRole("textbox", { name: /項目名/ }).fill(`${TAG} 計画項目`)
  await add.getByRole("textbox", { name: "計画開始 (必須)" }).fill("2026-10-01")
  await add.getByRole("textbox", { name: "計画終了 (必須)" }).fill("2026-10-16")
  await add.getByRole("radio", { name: "PBI連動" }).check()
  await add.getByRole("button", { name: "保存" }).click()
  await page.getByRole("button", { name: `${TAG} 計画項目 の操作` }).click()
  await page.getByRole("menuitem", { name: "PBIをリンク" }).click()
  const edit = page.getByRole("dialog")
  await edit.getByRole("searchbox").fill(TAG)
  await edit.getByRole("checkbox", { name: new RegExp(TAG) }).check()
  await expect(edit.getByRole("heading", { name: /リンクした PBI \(1\)/ })).toBeVisible()
  await edit.getByRole("button", { name: "保存" }).click()
  await page.getByRole("button", { name: "その他の操作" }).click()
  await page.getByRole("menuitem", { name: "基準線を保存" }).click()
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).first().getByRole("button", { name: "基準線を保存" }).click()
  await expect(page.getByText("基準線を保存しました")).toBeVisible()
  await page.getByRole("button", { name: `${TAG} 計画項目 の操作` }).click()
  await page.getByRole("menuitem", { name: "詳細を編集" }).click()
  await page.getByRole("dialog").getByRole("textbox", { name: "計画開始 (必須)" }).fill("2026-10-08")
  await page.getByRole("dialog").getByRole("textbox", { name: "計画終了 (必須)" }).fill("2026-10-30")
  await page.getByRole("dialog").getByRole("button", { name: "保存" }).click()
  await page.evaluate(() => { window.print = () => undefined })
  await page.getByRole("button", { name: "その他の操作" }).click()
  await page.getByRole("menuitem", { name: "印刷" }).click()
  await expect(page.getByRole("dialog", { name: "印刷" })).toBeVisible()
  await snap(s, "w-po-print-dialog")
  await page.getByRole("dialog", { name: "印刷" }).getByRole("button", { name: "キャンセル" }).click()

  // 5. Sprint planning in a fresh project (the pilot has an overdue active sprint)
  await visit(s, "/", "home")
  await page.getByRole("button", { name: "新規プロジェクト" }).click()
  await page.getByRole("dialog").getByRole("textbox", { name: /プロジェクト名/ }).fill(`${TAG} スプリント計画`)
  await page.getByRole("dialog").getByRole("button", { name: "作成" }).click()
  const href = await page.getByRole("link", { name: new RegExp(`${TAG} スプリント計画`) }).first().getAttribute("href")
  expect(href).toBeTruthy()
  fs.writeFileSync(`${OUT}/acc-project.txt`, href!)
  await visit(s, `${href}/backlog`, "new backlog")
  for (const [i, pts] of [[1, "3"], [2, "5"]] as const) {
    await page.getByRole("button", { name: "PBI追加" }).first().click()
    const d = page.getByRole("dialog")
    await d.getByRole("textbox", { name: "イニシアティブ" }).fill(`${TAG} 計画対象PBI ${i}`)
    await d.getByRole("button", { name: pts, exact: true }).click()
    await d.getByRole("combobox", { name: "ステータス" }).selectOption({ label: "着手可能" })
    await d.getByRole("button", { name: "追加" }).click()
    await expect(d).toBeHidden()
  }
  await visit(s, `${href}/sprints`, "new sprints")
  await page.getByRole("button", { name: "スプリント作成" }).first().click()
  const form = page.getByRole("region", { name: "新規スプリント" })
  await form.getByRole("textbox", { name: /スプリント名/ }).fill(`${TAG} スプリント1`)
  await form.getByRole("checkbox", { name: /#1 / }).check()
  await form.getByRole("checkbox", { name: /#2 / }).check()
  await form.getByRole("button", { name: /作成（2件取り込み）/ }).click()
  await expect(page.getByText("スプリントを作成しました")).toBeVisible()
  await page.getByRole("button", { name: "「実行中」へ移行" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "開始する" }).click()
  await expect(page.getByText(/を開始しました。チームに通知しました。/)).toBeVisible()
  await expect(page.getByText("実行中").first()).toBeVisible()
  await snap(s, "w-po-sprint-started")
  flushErrs(s, "po walkthrough")
  await s.ctx.close()
})

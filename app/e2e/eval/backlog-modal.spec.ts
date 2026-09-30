import { expect, test, type Page } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })
test.use({ permissions: ["clipboard-read", "clipboard-write"] })

async function mkPbi(page: Page, tag: string) {
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として、モーダルを確認したい。それは評価のためだ。", workloadScore: 1 })
  expect(r.status).toBe(201)
  return (r.body.data ?? r.body) as { id: string; displayId: number; version: number }
}
async function getPbi(page: Page, id: string) {
  const r = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${id}`)
  return (r.body.data ?? r.body) as Record<string, unknown>
}

test("read → 編集 → 更新 bumps version; history localized", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-MODAL-${stamp()}`
  const pbi = await mkPbi(page, tag)
  const v0 = (await getPbi(page, pbi.id)).version as number
  await page.goto(`${BACKLOG}?q=${tag}`)
  await page.getByRole("button", { name: tag }).click()
  const dlg = page.getByRole("dialog", { name: tag })
  await expect(dlg).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`pbi=${pbi.displayId}`))
  await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "エピック" }).fill("E2E-Epic")
  await dlg.getByRole("group", { name: /を選ぶ$/ }).getByRole("button", { name: "5", exact: true }).click()
  await expect(dlg.getByRole("spinbutton", { name: "工数" })).toHaveValue("5")
  await dlg.getByRole("combobox", { name: "ステータス" }).selectOption("ready")
  const patch = page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes(pbi.id))
  await dlg.getByRole("button", { name: "更新" }).click()
  console.log("PATCH body", (await patch).postData())
  await expect(page.getByText("PBI を保存しました")).toBeVisible()
  await expect(dlg.getByRole("button", { name: "編集" })).toBeVisible()
  await expect(dlg.getByText("E2E-Epic")).toBeVisible()
  const v1 = (await getPbi(page, pbi.id)).version as number
  console.log("version", v0, "->", v1)
  expect(v1).toBeGreaterThan(v0)
  // card moved to Ready in the list behind
  await expect(page.getByRole("region", { name: "Ready（着手可能）" }).getByRole("button", { name: tag })).toHaveCount(1)
  await dlg.getByRole("tab", { name: "履歴" }).click()
  const hist = dlg.getByRole("region", { name: "履歴" })
  await expect(hist.getByText("E2E PO が更新しました").first()).toBeVisible()
  await expect(hist.getByText(/エピック: （なし） → E2E-Epic/)).toBeVisible()
  await expect(hist.getByText(/ステータス: 未準備 → 着手可能/)).toBeVisible()
  const histText = await hist.innerText()
  console.log("HISTORY\n" + histText)
  expect(histText).not.toMatch(/workloadScore|not_ready|initiative|userStory|backlog_item/)
  await page.screenshot({ path: `${SHOTS}/pbi-history.png` })
  report("edit", issues)
})

test("unsaved-change guard (X, Esc, キャンセル, reload)", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-GUARD-${stamp()}`
  const pbi = await mkPbi(page, tag)
  await page.goto(`${BACKLOG}?pbi=${pbi.id}`)
  const dlg = page.getByRole("dialog", { name: tag })
  await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("dirty")
  // X
  await dlg.getByRole("button", { name: "閉じる" }).first().click()
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "未保存の変更があります" }))
  await expect(confirm.getByText("変更内容は保存されていません。破棄して閉じますか？")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/pbi-unsaved-guard.png` })
  await confirm.getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg.getByRole("textbox", { name: "PO メモ" })).toHaveValue("dirty")
  // Esc
  await dlg.getByRole("textbox", { name: "PO メモ" }).focus()
  await page.keyboard.press("Escape")
  const escGuard = await confirm.getByText("変更内容は保存されていません").isVisible().catch(() => false)
  console.log("Esc shows guard:", escGuard, "dialog still open:", await dlg.isVisible())
  if (escGuard) await confirm.getByRole("button", { name: "キャンセル" }).click()
  // backdrop click must not close in edit mode
  await page.mouse.click(10, 10)
  await expect(dlg).toBeVisible()
  // reload -> beforeunload
  let sawBeforeUnload = false
  page.once("dialog", async (d) => {
    sawBeforeUnload = d.type() === "beforeunload"
    await d.dismiss()
  })
  await page.reload({ timeout: 5000 }).catch(() => undefined)
  console.log("beforeunload on reload:", sawBeforeUnload)
  // キャンセル with dirty asks, then 破棄
  if (await dlg.isVisible()) {
    await dlg.getByRole("button", { name: "キャンセル" }).click()
    await expect(confirm.getByText("変更内容は保存されていません。破棄して閉じますか？")).toBeVisible()
    const labels = await confirm.getByRole("button").allInnerTexts()
    console.log("guard buttons", labels)
    await confirm.getByRole("button", { name: /破棄/ }).click()
    await expect(dlg.getByRole("button", { name: "編集" })).toBeVisible()
    expect((await getPbi(page, pbi.id)).poNote ?? "").toBe("")
  }
  // Back with dirty form, modal opened by clicking the card (pushState entry)
  await page.goto(`${BACKLOG}?q=${tag}`)
  await page.getByRole("button", { name: tag }).click()
  await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("dirty2")
  await page.goBack()
  await page.waitForTimeout(800)
  console.log("after Back with dirty form: url", page.url(), "dialog visible", await dlg.isVisible(), "guard", await confirm.getByText("変更内容は保存されていません").isVisible().catch(() => false))
  await page.screenshot({ path: `${SHOTS}/pbi-dirty-back.png` })
  // F-02: Back asks first; cancelling keeps the modal, its ?pbi= URL and the edits.
  await expect(confirm.getByText("変更内容は保存されていません")).toBeVisible()
  await confirm.getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg.getByRole("textbox", { name: "PO メモ" })).toHaveValue("dirty2")
  expect(page.url()).toContain("pbi=")
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("guard", issues)
})

test("create modal", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  const dlg = page.getByRole("dialog", { name: "PBI追加" })
  await expect(dlg).toBeVisible()
  // empty submit: F-01 — "追加" stays disabled until a user story or an initiative is entered
  await expect(dlg.getByRole("button", { name: "追加" })).toBeDisabled()
  await page.waitForTimeout(300)
  const alerts = await page.getByRole("alert").allInnerTexts()
  console.log("empty submit -> alerts", alerts, "dialog open", await dlg.isVisible())
  await page.screenshot({ path: `${SHOTS}/pbi-create-empty.png` })
  const tag = `E2E-CREATE-${stamp()}`
  if (!(await dlg.isVisible())) {
    // BUG: empty form was accepted -> an empty PBI now exists. Record + trash it.
    const r = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
    const d = (r.body.data ?? r.body) as Record<string, Array<Record<string, unknown>>>
    const empties = [...d.readyItems, ...d.notReadyItems].filter((x) => !x.initiative && !x.userStory)
    console.log("EMPTY PBIs created by empty submit:", empties.map((e) => `#${e.displayId}`))
    for (const e of empties) await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${e.id}`)
    await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  }
  {
    await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill(tag)
    await dlg.getByRole("textbox", { name: "ユーザーストーリー" }).fill("E2E として、作成モーダルを確認したい。それは評価のためだ。")
    await dlg.getByRole("group", { name: /を選ぶ$/ }).getByRole("button", { name: "3", exact: true }).click()
    const post = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/backlog"))
    await dlg.getByRole("button", { name: "追加" }).click()
    const res = await post
    expect(res.status()).toBe(201)
    await expect(dlg).toHaveCount(0)
  }
  await expect(page.getByRole("button", { name: tag })).toBeVisible()
  // cancel with dirty form
  await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill("x")
  await page.keyboard.press("Escape")
  const guard = await page.getByText("変更内容は保存されていません").isVisible().catch(() => false)
  console.log("create modal Esc dirty guard:", guard)
  if (guard) await page.getByRole("button", { name: /破棄/ }).click()
  report("create", issues)
})

test("deep links, back button, copy link", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-LINK-${stamp()}`
  const pbi = await mkPbi(page, tag)
  for (const ref of [pbi.id, String(pbi.displayId), `%23${pbi.displayId}`]) {
    await page.goto(`${BACKLOG}?pbi=${ref}`)
    await expect(page.getByRole("dialog", { name: tag })).toBeVisible()
  }
  // close deep-linked modal -> param removed, stays on backlog
  await page.getByRole("dialog", { name: tag }).getByRole("button", { name: "閉じる" }).last().click()
  await expect(page).not.toHaveURL(/pbi=/)
  await expect(page).toHaveURL(/\/backlog/)
  // unknown displayId
  await page.goto(`${BACKLOG}?pbi=99999`)
  await expect(page.getByText("PBI 99999 が見つかりません（ゴミ箱に移動された可能性があります）")).toBeVisible()
  await expect(page).not.toHaveURL(/pbi=/)
  // unknown id string
  await page.goto(`${BACKLOG}?pbi=nonexistent-id`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/pbi-deeplink-bad-id.png` })
  console.log("bad id dialog text:", (await page.getByRole("dialog").innerText().catch(() => "none")).slice(0, 200))
  // back button closes modal opened by click
  await page.goto(`${BACKLOG}?q=${tag}`)
  await page.getByRole("button", { name: tag }).click()
  await expect(page.getByRole("dialog", { name: tag })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("dialog", { name: tag })).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`q=${tag}`))
  // forward re-opens?
  await page.goForward()
  await page.waitForTimeout(500)
  console.log("forward reopens:", await page.getByRole("dialog", { name: tag }).isVisible())
  if (!(await page.getByRole("dialog", { name: tag }).isVisible())) await page.getByRole("button", { name: tag }).click()
  // copy link
  await page.getByRole("dialog", { name: tag }).getByRole("button", { name: "リンクをコピー" }).click()
  await expect(page.getByText("リンクをコピーしました")).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  console.log("clipboard", clip)
  expect(clip).toContain(`/projects/${PROJECT}/backlog?pbi=${pbi.displayId}`)
  // open copied link in new page
  const p2 = await page.context().newPage()
  await p2.goto(clip)
  await expect(p2.getByRole("dialog", { name: tag })).toBeVisible()
  await p2.close()
  // deep link from another page (dashboard) keeps working when list is filtered
  await page.goto(`${BACKLOG}?status=completed&pbi=${pbi.displayId}`)
  await page.waitForTimeout(1500)
  console.log("deep link while filtered hides item: dialog visible", await page.getByRole("dialog", { name: tag }).isVisible())
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("links", issues)
})

test("comments: @mention autocomplete, post, edit, delete", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-CMT-${stamp()}`
  const pbi = await mkPbi(page, tag)
  await page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
  const dlg = page.getByRole("dialog", { name: tag })
  await dlg.getByRole("tab", { name: "コメント" }).click()
  const box = dlg.getByRole("textbox", { name: "新しいコメント" })
  await box.click()
  await box.pressSequentially("E2E コメント @E2E")
  const list = dlg.getByRole("listbox", { name: "メンション候補" })
  await expect(list).toBeVisible()
  const options = await list.getByRole("option").allInnerTexts()
  console.log("mention options", options)
  await page.screenshot({ path: `${SHOTS}/comment-mention.png` })
  // navigate to "E2E SM"
  const idx = options.findIndex((o) => /E2E SM/.test(o))
  expect(idx).toBeGreaterThanOrEqual(0)
  for (let i = 0; i < idx; i++) await page.keyboard.press("ArrowDown")
  await expect(list.getByRole("option").nth(idx)).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")
  await expect(list).toHaveCount(0)
  const val = await box.inputValue()
  console.log("composer value after mention:", JSON.stringify(val))
  await box.pressSequentially("確認お願いします")
  const post = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("comment"))
  await page.keyboard.press("Control+Enter")
  const res = await post
  console.log("post comment", res.status(), (await res.text()).slice(0, 300))
  expect(res.status()).toBeLessThan(300)
  await expect(box).toHaveValue("")
  const thread = dlg.getByRole("region", { name: "コメント" })
  await expect(thread.getByText("確認お願いします")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/comment-posted.png` })
  // Escape closes mention list without closing dialog
  await box.pressSequentially("@E2E")
  await expect(list).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(list).toHaveCount(0)
  await expect(dlg).toBeVisible()
  await box.fill("")
  // edit own
  await thread.getByRole("button", { name: "編集" }).first().click()
  const editBox = thread.getByRole("textbox", { name: "コメントを編集" })
  await editBox.fill("E2E 編集後のコメント")
  await thread.getByRole("button", { name: "保存" }).click()
  await expect(thread.getByText("E2E 編集後のコメント")).toBeVisible()
  await expect(thread.getByText("（編集済み）")).toBeVisible()
  // delete own
  await thread.getByRole("button", { name: "削除" }).first().click()
  await expect(page.getByText("コメントを削除しますか？")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/comment-delete-confirm.png` })
  await page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "コメントを削除しますか？" })).getByRole("button", { name: "削除" }).click()
  await expect(page.getByText("コメントを削除しました")).toBeVisible()
  console.log("thread after delete:", (await thread.innerText()).slice(0, 300))
  // history shows comment
  await dlg.getByRole("tab", { name: "履歴" }).click()
  console.log("history after comment:", (await dlg.getByRole("region", { name: "履歴" }).innerText()).slice(0, 500))
  // leave a mention for e2e-sm for the notification test (kept)
  await dlg.getByRole("tab", { name: "コメント" }).click()
  await box.pressSequentially("@E2E S")
  await page.keyboard.press("Enter")
  await box.pressSequentially("E2E 通知テスト")
  await page.keyboard.press("Control+Enter")
  await expect(thread.getByText("E2E 通知テスト")).toBeVisible()
  console.log("MENTION_PBI", pbi.displayId, tag)
  report("comments", issues)
})

import { expect, test, type Page } from "@playwright/test"
import fs from "node:fs"
import { api, BACKLOG, gotoBacklog, login, newUserPage, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })

async function openPalette(page: Page) {
  await page.keyboard.press("Control+k")
  const dlg = page.getByRole("dialog", { name: "検索とコマンド" })
  await expect(dlg).toBeVisible()
  return dlg
}

test("Ctrl+K search: JA / ID / displayId, keyboard nav, deep link", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  let dlg = await openPalette(page)
  const input = dlg.getByRole("combobox").or(dlg.getByRole("textbox", { name: "検索キーワード" })).first()
  await expect(input).toBeFocused()
  await input.fill("O")
  await expect(dlg.getByText("2 文字以上入力すると検索します")).toBeVisible()
  // JA query
  await input.fill("テーブル")
  await expect(dlg.getByText(/\d+ 件の候補/)).toBeVisible({ timeout: 15000 })
  fs.writeFileSync(`${SHOTS}/../_aria-search.txt`, await dlg.ariaSnapshot())
  await page.screenshot({ path: `${SHOTS}/search-ja.png` })
  console.log("JA results:\n" + (await dlg.innerText()).slice(0, 800))
  // ID (Indonesian) query - original text of some PBIs is Indonesian
  await input.fill("Pengambilan data")
  await page.waitForTimeout(1200)
  console.log("ID results:\n" + (await dlg.innerText()).slice(0, 500))
  // query matching translated ID text of a JA PBI
  await input.fill("tabel OLE")
  await page.waitForTimeout(1200)
  console.log("ID(translated) results:\n" + (await dlg.innerText()).slice(0, 500))
  // displayId
  await input.fill("#38")
  await page.waitForTimeout(1200)
  console.log("#38 results:\n" + (await dlg.innerText()).slice(0, 400))
  await input.fill("38")
  await page.waitForTimeout(1200)
  const txt38 = await dlg.innerText()
  console.log("38 results:\n" + txt38.slice(0, 400))
  await page.screenshot({ path: `${SHOTS}/search-displayid.png` })
  // keyboard nav
  await input.fill("PFE")
  await expect(dlg.getByText(/\d+ 件の候補/)).toBeVisible({ timeout: 15000 })
  const active0 = await input.getAttribute("aria-activedescendant")
  await page.keyboard.press("ArrowDown")
  const active1 = await input.getAttribute("aria-activedescendant")
  console.log("activedescendant", active0, "->", active1)
  const activeText = active1 ? await page.locator(`[id="${active1}"]`).innerText() : ""
  console.log("active option", activeText)
  await page.keyboard.press("Enter")
  await page.waitForLoadState("networkidle")
  console.log("navigated to", page.url())
  await page.waitForTimeout(1000)
  const modal = await page.getByRole("dialog").first().getAttribute("aria-label").catch(() => null)
  console.log("dialog after nav", modal, await page.getByRole("dialog").count())
  await page.screenshot({ path: `${SHOTS}/search-nav-result.png` })
  // Esc closes
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  dlg = await openPalette(page)
  await page.keyboard.press("Escape")
  await expect(dlg).toHaveCount(0)
  // commands
  dlg = await openPalette(page)
  await dlg.getByRole("combobox").or(dlg.getByRole("textbox")).first().fill("ゴミ箱")
  await page.waitForTimeout(1000)
  console.log("command results:\n" + (await dlg.innerText()).slice(0, 400))
  await page.keyboard.press("Escape")
  report("search", issues)
})

test("search as Indonesian-language dev", async ({ page }) => {
  const issues = watch(page)
  await login(page, "dev")
  await page.goto(BACKLOG)
  await page.waitForLoadState("networkidle")
  console.log("dev html lang", await page.locator("html").getAttribute("lang"), "h1", await page.locator("h1").first().innerText())
  const me = await api(page, "GET", "/api/me")
  console.log("/api/me", me.status, JSON.stringify(me.body).slice(0, 300))
  await page.keyboard.press("Control+k")
  const dlg = page.getByRole("dialog").first()
  await dlg.getByRole("combobox").or(dlg.getByRole("textbox")).first().fill("tabel")
  await page.waitForTimeout(1500)
  console.log("dev search:\n" + (await dlg.innerText()).slice(0, 500))
  await page.screenshot({ path: `${SHOTS}/search-dev.png` })
  report("search-dev", issues)
})

test("notifications: mention + assignment → SM bell, mark read, preferences", async ({ browser }) => {
  // precondition: SM has the "mentioned" preference ON
  {
    const pre = await newUserPage(browser, "sm")
    await pre.page.goto("/me")
    const sw = pre.page.getByRole("switch", { name: "コメントでメンションされたとき" })
    await expect(sw).toBeVisible()
    if (!(await sw.isChecked())) {
      const put = pre.page.waitForResponse((res) => res.url().includes("/api/notifications/preferences"))
      await sw.click()
      await put
    }
    await pre.ctx.close()
  }
  // PO produces a mention and an assignment for E2E SM
  const po = await newUserPage(browser, "po")
  await gotoBacklog(po.page)
  const tag = `E2E-NOTIF-${stamp()}`
  const r = await api(po.page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として通知を確認したい。", workloadScore: 1 })
  const pbi = (r.body.data ?? r.body) as { id: string; displayId: number }
  await po.page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
  const pdlg = po.page.getByRole("dialog", { name: tag })
  await pdlg.getByRole("tab", { name: "コメント" }).click()
  const box = pdlg.getByRole("textbox", { name: "新しいコメント" })
  await box.pressSequentially("@E2E S")
  await expect(pdlg.getByRole("listbox", { name: "メンション候補" }).getByRole("option", { name: /E2E SM/ })).toBeVisible()
  await po.page.keyboard.press("Enter")
  await expect(box).toHaveValue(/@\[E2E SM\]/)
  await box.pressSequentially("E2E 通知確認")
  await po.page.keyboard.press("Control+Enter")
  await expect(pdlg.getByText("E2E 通知確認")).toBeVisible()
  // assign PO = E2E SM (free-text name) via edit
  await pdlg.getByRole("tab", { name: "詳細" }).click()
  await pdlg.getByRole("button", { name: "編集" }).click()
  await pdlg.getByRole("textbox", { name: "プロダクトオーナー" }).fill("E2E SM")
  await pdlg.getByRole("button", { name: "更新" }).click()
  await expect(po.page.getByText("PBI を保存しました")).toBeVisible()
  await po.ctx.close()

  const sm = await newUserPage(browser, "sm")
  const page = sm.page
  await page.goto(`/projects/${PROJECT}`)
  await page.waitForLoadState("networkidle")
  const bell = page.getByRole("button", { name: /^通知/ })
  const label = await bell.getAttribute("aria-label")
  console.log("bell label", label)
  expect(label).toMatch(/未読 \d+ 件/)
  await bell.click()
  const panel = page.getByRole("dialog", { name: "通知" })
  await expect(panel).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/notif-panel.png` })
  const panelText = await panel.innerText()
  console.log("PANEL:\n" + panelText.slice(0, 1200))
  const mention = panel.getByText(new RegExp(`E2E PO さんが「#${pbi.displayId} ${tag}」のコメントであなたをメンションしました`))
  await expect(mention).toBeVisible()
  const assigned = await panel.getByText(/「E2E として通知を確認したい。」の担当者にあなたを設定しました/).count()
  console.log("assignment notification for PO free-text:", assigned)
  const before = Number((label ?? "").match(/未読 (\d+)/)?.[1] ?? 0)
  await mention.click()
  await page.waitForLoadState("networkidle")
  console.log("after click url", page.url())
  await expect(page).toHaveURL(new RegExp(`/backlog\\?.*pbi=`))
  await expect(page.getByRole("dialog", { name: tag })).toBeVisible()
  const tabSel = await page.getByRole("dialog", { name: tag }).getByRole("tab", { selected: true }).innerText()
  console.log("tab selected after notification click:", tabSel)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(1000)
  const after = Number(((await bell.getAttribute("aria-label")) ?? "").match(/未読 (\d+)/)?.[1] ?? 0)
  console.log("unread", before, "->", after)
  expect(after).toBeLessThan(before)
  // mark all read
  await bell.click()
  await panel.getByRole("button", { name: "すべて既読" }).click()
  await expect(bell).toHaveAttribute("aria-label", "通知")
  await page.screenshot({ path: `${SHOTS}/notif-all-read.png` })
  await page.keyboard.press("Escape")
  // preferences
  await page.goto("/me")
  await page.waitForLoadState("networkidle")
  const switches = page.getByRole("switch")
  console.log("switch count", await switches.count(), await switches.evaluateAll((els) => els.map((e) => `${e.getAttribute("aria-label") ?? e.textContent}:${e.getAttribute("aria-checked")}`)))
  const mentionSwitch = page.getByRole("switch", { name: "コメントでメンションされたとき" })
  const was = await mentionSwitch.isChecked()
  const put = page.waitForResponse((res) => /notif|preference/i.test(res.url()) && res.request().method() !== "GET")
  await mentionSwitch.click()
  const pres = await put
  console.log("pref save", pres.request().method(), pres.url(), pres.status())
  if (was) await expect(mentionSwitch).not.toBeChecked()
  else await expect(mentionSwitch).toBeChecked()
  await page.reload()
  if (was) await expect(page.getByRole("switch", { name: "コメントでメンションされたとき" })).not.toBeChecked()
  else await expect(page.getByRole("switch", { name: "コメントでメンションされたとき" })).toBeChecked()
  await page.screenshot({ path: `${SHOTS}/me-notif-prefs.png`, fullPage: true })
  // restore
  await page.getByRole("switch", { name: "コメントでメンションされたとき" }).click()
  await page.waitForTimeout(500)
  report("notif-sm", sm.issues)
  await sm.ctx.close()
})

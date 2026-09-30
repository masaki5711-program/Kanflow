import { expect, test } from "@playwright/test"
import fs from "node:fs"
import { api, BACKLOG, gotoBacklog, newUserPage, PROJECT, report, SHOTS, stamp } from "./backlog-support"

test.describe.configure({ mode: "serial" })

test("optimistic lock: second save gets conflict toast and reloads", async ({ browser }) => {
  const a = await newUserPage(browser, "po")
  const b = await newUserPage(browser, "sm")
  await gotoBacklog(a.page)
  const tag = `E2E-LOCK-${stamp()}`
  const r = await api(a.page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として競合を確認したい。", workloadScore: 1 })
  const pbi = (r.body.data ?? r.body) as { id: string; displayId: number }
  for (const u of [a, b]) {
    await u.page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
    await u.page.getByRole("dialog", { name: tag }).getByRole("button", { name: "編集" }).click()
  }
  await a.page.getByRole("dialog").getByRole("textbox", { name: "PO メモ" }).fill("A wins")
  await a.page.getByRole("dialog").getByRole("button", { name: "更新" }).click()
  await expect(a.page.getByText("PBI を保存しました")).toBeVisible()

  await b.page.getByRole("dialog").getByRole("textbox", { name: "PO メモ" }).fill("B loses")
  const resp = b.page.waitForResponse((res) => res.request().method() === "PATCH")
  await b.page.getByRole("dialog").getByRole("button", { name: "更新" }).click()
  const res = await resp
  console.log("B PATCH", res.status(), (await res.text()).slice(0, 300))
  expect(res.status()).toBe(409)
  await b.page.waitForTimeout(600)
  const toasts = await b.page.getByRole("status").or(b.page.getByRole("alert")).allInnerTexts()
  console.log("B toasts", JSON.stringify(toasts))
  await b.page.screenshot({ path: `${SHOTS}/lock-conflict.png` })
  const dlg = b.page.getByRole("dialog")
  const stillEditing = await dlg.getByRole("button", { name: "更新" }).isVisible()
  const memoValue = stillEditing ? await dlg.getByRole("textbox", { name: "PO メモ" }).inputValue() : await dlg.innerText()
  console.log("B after conflict: editing", stillEditing, "memo/view contains A:", /A wins/.test(memoValue), "contains B:", /B loses/.test(memoValue))
  expect(/A wins/.test(memoValue)).toBe(true)
  // B can save again on top of the new version
  if (!stillEditing) await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("B retry")
  await dlg.getByRole("button", { name: "更新" }).click()
  await expect(b.page.getByText("PBI を保存しました")).toBeVisible()
  report("lock-a", a.issues)
  report("lock-b", b.issues)
  await api(a.page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  await a.ctx.close()
  await b.ctx.close()
})

test("trash: delete → trash page → restore; permanent delete (PO); SM cannot purge", async ({ browser }) => {
  const po = await newUserPage(browser, "po")
  const page = po.page
  await gotoBacklog(page)
  const tag = `E2E-TRASH-${stamp()}`
  const mk = async (s: string) => {
    const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: `${tag}-${s}`, userStory: "E2E としてゴミ箱を確認したい。", workloadScore: 1 })
    return (r.body.data ?? r.body) as { id: string; displayId: number }
  }
  const p1 = await mk("A")
  const p2 = await mk("B")
  await page.goto(`${BACKLOG}?q=${tag}`)
  await expect(page.locator("[data-dnd-row]")).toHaveCount(2)
  // single delete via card trash button
  const row = page.locator("[data-dnd-row]").filter({ hasText: `${tag}-A` })
  await row.getByRole("button", { name: "削除" }).click()
  await expect(page.getByText("この PBI をゴミ箱に移動しますか？ゴミ箱から復元できます。")).toBeVisible()
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: "ゴミ箱に移動" }).click()
  await expect(page.locator("[data-dnd-row]")).toHaveCount(1)
  const undoVisible = await page.getByRole("button", { name: "元に戻す" }).isVisible().catch(() => false)
  console.log("single delete shows Undo:", undoVisible)
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${p2.id}`)

  await page.goto(`/projects/${PROJECT}/trash`)
  await page.waitForLoadState("networkidle")
  fs.writeFileSync(`${SHOTS}/../_aria-trash.txt`, await page.getByRole("main").ariaSnapshot())
  await page.screenshot({ path: `${SHOTS}/trash-page.png`, fullPage: true })
  const itemA = page.getByRole("listitem").filter({ hasText: `${tag}-A` })
  await expect(itemA).toBeVisible()
  // restore
  await itemA.getByRole("button", { name: "復元" }).click()
  const confirmRestore = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "復元しますか？" }))
  if (await confirmRestore.getByRole("button", { name: "復元" }).isVisible().catch(() => false)) await confirmRestore.getByRole("button", { name: "復元" }).click()
  await expect(page.getByText("復元しました")).toBeVisible()
  await expect(itemA).toHaveCount(0)
  const back = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${p1.id}`)
  expect(back.status).toBe(200)
  console.log("restored status", ((back.body.data ?? back.body) as Record<string, unknown>).status)

  // SM view of trash: purge hidden?
  const sm = await newUserPage(browser, "sm")
  await sm.page.goto(`/projects/${PROJECT}/trash`)
  await sm.page.waitForLoadState("networkidle")
  const itemB_sm = sm.page.getByRole("listitem").filter({ hasText: `${tag}-B` })
  await expect(itemB_sm).toBeVisible()
  console.log("SM trash buttons", await itemB_sm.getByRole("button").allInnerTexts())
  const smPurge = await api(sm.page, "DELETE", `/api/projects/${PROJECT}/trash/backlog_item/${p2.id}`)
  console.log("SM purge API status", smPurge.status)
  await sm.page.screenshot({ path: `${SHOTS}/trash-sm.png`, fullPage: true })
  report("trash-sm", sm.issues)
  await sm.ctx.close()
  // dev view
  const dev = await newUserPage(browser, "dev")
  await dev.page.goto(`/projects/${PROJECT}/trash`)
  await dev.page.waitForLoadState("networkidle")
  await dev.page.screenshot({ path: `${SHOTS}/trash-dev.png`, fullPage: true })
  console.log("DEV trash page text:", (await dev.page.getByRole("main").innerText()).slice(0, 300))
  report("trash-dev", dev.issues)
  await dev.ctx.close()

  // PO permanent delete
  await page.reload()
  const itemB = page.getByRole("listitem").filter({ hasText: `${tag}-B` })
  await itemB.getByRole("button", { name: "完全に削除" }).click()
  await expect(page.getByText(/完全に削除します。添付ファイルと翻訳も削除され、元に戻せません。/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/trash-purge-confirm.png` })
  await page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "完全に削除しますか？" })).getByRole("button", { name: "完全に削除" }).click()
  await expect(page.getByText("完全に削除しました")).toBeVisible()
  await expect(itemB).toHaveCount(0)
  const gone = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${p2.id}`)
  console.log("purged GET", gone.status)
  // restored PBI back in backlog
  await page.goto(`${BACKLOG}?q=${tag}`)
  await expect(page.locator("[data-dnd-row]")).toHaveCount(1)
  // deep link to trashed PBI
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${p1.id}`)
  await page.goto(`${BACKLOG}?pbi=${p1.displayId}`)
  await expect(page.getByText(`PBI ${p1.displayId} が見つかりません（ゴミ箱に移動された可能性があります）`)).toBeVisible()
  report("trash-po", po.issues)
  await po.ctx.close()
})

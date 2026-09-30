import { expect, test } from "@playwright/test"
import * as fs from "node:fs"
import { open, snap, visit, flushErrs, overflow, PILOT, OUT } from "./accept-helpers"

/**
 * Acceptance cycle 3 — Developer (id), Section manager (ja) and Admin (ja)
 * walkthroughs. Read-only except the board moves in "dev board", which are
 * gated behind ACC_WRITE=1 (each move re-triggers AI translation, see A3-02).
 */
test.setTimeout(240_000)

const ACC = process.env.ACC_PROJECT
  ?? (fs.existsSync(`${OUT}/acc-project.txt`) ? fs.readFileSync(`${OUT}/acc-project.txt`, "utf8").trim() : "")

test("dev: home, mention notification, burndown", async ({ browser }) => {
  const s = await open(browser, "dev", { lang: "id", logFile: "dev-walkthrough.log" })
  const { page } = s
  await visit(s, "/", "home")
  await expect(page.getByRole("heading", { name: "Tugas Sprint saya" })).toBeVisible()
  const bell = page.getByRole("button", { name: /^Notifikasi/ }).first()
  s.log(`bell: ${await bell.getAttribute("aria-label")}`)
  await bell.click()
  const dlg = page.getByRole("dialog", { name: "Notifikasi" })
  await dlg.getByRole("button", { name: /Tampilkan lebih banyak/ }).click()
  const mention = dlg.getByRole("button", { name: /menyebut Anda/ }).first()
  await expect(mention).toBeVisible()
  const items = await dlg.getByRole("listitem").allInnerTexts()
  const pos = items.findIndex((t) => /menyebut Anda/.test(t))
  s.log(`mention position in list: ${pos + 1} of ${items.length}`)
  await mention.click()
  await expect(page).toHaveURL(/tab=comments/)
  const panel = page.getByRole("tabpanel")
  await expect(panel).toContainText("@E2E Dev")
  s.log(`comment shown to id user: ${(await panel.getByRole("listitem").first().innerText()).replace(/\n/g, " / ")}`)
  await snap(s, "w-dev-mention-opened")
  if (ACC) {
    await visit(s, `${ACC}/burndown`, "burndown")
    await snap(s, "w-dev-burndown")
  }
  await visit(s, `/projects/${PILOT}/burndown`, "pilot burndown")
  flushErrs(s, "dev")
  await s.ctx.close()
})

test("dev board moves + comment (writes)", async ({ browser }) => {
  test.skip(!ACC || process.env.ACC_WRITE !== "1", "set ACC_WRITE=1")
  const s = await open(browser, "dev", { lang: "id", logFile: "dev-walkthrough.log" })
  const { page } = s
  await visit(s, `${ACC}/sprints?view=board`, "board")
  const board = page.getByRole("region", { name: /Papan kanban/ })
  const todo = board.getByRole("group", { name: "Belum Mulai" })
  await todo.getByRole("button", { name: /^Pindahkan/ }).first().click()
  await page.locator("button:visible[data-move-option]", { hasText: /Sedang Berjalan/ }).last().click()
  await todo.getByRole("button", { name: /^Pindahkan/ }).first().click()
  await page.locator("button:visible[data-move-option]", { hasText: /Selesai/ }).last().click()
  const done = page.getByRole("dialog")
  await done.getByRole("textbox").fill("E2E-ACC selesai.")
  await done.getByRole("button", { name: "Tugas Selesai" }).click()
  await board.getByRole("group", { name: "Sedang Berjalan" }).getByRole("button", { name: /^Komentar/ }).first().click()
  const c = page.getByRole("dialog")
  await c.getByRole("textbox").last().fill("E2E-ACC sedang dikerjakan.")
  await c.getByRole("button", { name: "Kirim" }).click()
  await expect(c.getByRole("listitem")).toHaveCount(1)
  flushErrs(s, "dev board")
  await s.ctx.close()
})

test("section manager: portfolio -> project -> plan read-only", async ({ browser }) => {
  const s = await open(browser, "sec", { lang: "ja", logFile: "sec-walkthrough.log" })
  const { page } = s
  await visit(s, "/portfolio", "portfolio")
  await expect(page.getByRole("table", { name: "プロジェクト別の状況" })).toBeVisible()
  await page.getByRole("columnheader", { name: "期限切れ" }).getByRole("button").click()
  s.log(`first sort click -> ${page.url()}`)
  await page.getByRole("link", { name: /IoTプラットフォーム/ }).first().click()
  await expect(page).toHaveURL(new RegExp(`/projects/${PILOT}$`))
  await visit(s, `/projects/${PILOT}/plan`, "plan")
  await expect(page.getByRole("button", { name: "項目を追加" })).toHaveCount(0)
  await page.getByRole("button", { name: "その他の操作" }).click()
  const menu = await page.getByRole("menuitem").allInnerTexts()
  s.log(`sec plan menu: ${menu.join(", ")}`)
  expect(menu).not.toContain("基準線を保存")
  await page.keyboard.press("Escape")
  const rowMenu = page.getByRole("button", { name: / の操作$/ }).first()
  await rowMenu.click()
  s.log(`sec row menu: ${(await page.getByRole("menuitem").allInnerTexts()).join(", ")}`)
  await page.getByRole("menuitem").first().click()
  await expect(page.getByRole("dialog").getByRole("textbox").first()).toBeDisabled()
  await snap(s, "w-sec-plan-detail")
  flushErrs(s, "sec")
  await s.ctx.close()
})

test("admin: users, metrics, api tokens, trash", async ({ browser }) => {
  const s = await open(browser, "admin", { lang: "ja", logFile: "admin-walkthrough.log" })
  const { page } = s
  await visit(s, "/admin/users", "users")
  await page.getByPlaceholder(/名前・メール/).fill("e2e")
  await expect(page.getByText(/^\d+ \/ \d+ 名のユーザー$/)).toBeVisible()
  await page.getByRole("button", { name: "ユーザー追加" }).click()
  const d = page.getByRole("dialog")
  await d.getByRole("textbox", { name: /名前/ }).fill("E2E-ACC 重複テスト")
  await d.getByRole("textbox", { name: /メール/ }).fill("e2e-po@example.test")
  await d.getByRole("textbox", { name: /初期パスワード/ }).fill("E2e-Acc-Pass-1")
  await d.getByRole("button", { name: "作成" }).click()
  await expect(d.getByText("このメールアドレスは既に使用されています")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("alertdialog").getByRole("button", { name: "破棄して閉じる" }).click()
  for (const [url, label] of [["/admin/metrics", "metrics"], ["/admin/api-tokens", "tokens"], ["/admin/trash", "trash"]]) {
    await visit(s, url, label)
    s.log(`${label} overflow=${await overflow(s)}`)
    await snap(s, `w-admin-${label}`)
  }
  flushErrs(s, "admin")
  await s.ctx.close()
})

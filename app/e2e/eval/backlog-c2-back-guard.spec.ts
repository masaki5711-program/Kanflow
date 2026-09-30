import { expect, test, type Page } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

/**
 * Cycle 2 — F-02: browser Back while the PBI modal (or create modal) is dirty.
 * Real Chromium, real history (page.goBack and the Alt+Left shortcut).
 */
test.describe.configure({ mode: "serial" })

async function mkPbi(page: Page, tag: string) {
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E として、Back ガードを確認したい。", workloadScore: 1 })
  expect(r.status).toBe(201)
  return (r.body.data ?? r.body) as { id: string; displayId: number }
}

/** Log popstate / pushState activity from inside the page. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __hist: string[] }
    w.__hist = []
    const push = history.pushState.bind(history)
    history.pushState = function (d: unknown, u: string, url?: string | URL | null) {
      w.__hist.push(`push ${String(url)}`)
      return push(d, u, url)
    } as typeof history.pushState
    window.addEventListener("popstate", () => w.__hist.push(`popstate -> ${location.search}`), true)
    const add = window.addEventListener.bind(window)
    const rem = window.removeEventListener.bind(window)
    window.addEventListener = function (t: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
      if (t === "popstate") w.__hist.push("add-listener")
      return add(t, l, o)
    } as typeof window.addEventListener
    window.removeEventListener = function (t: string, l: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) {
      if (t === "popstate") w.__hist.push("remove-listener")
      return rem(t, l, o)
    } as typeof window.removeEventListener
  })
}

const guardText = "変更内容は保存されていません"

test("F-02 Back on a dirty PBI edit (card click → 編集 → Back)", async ({ page }) => {
  const issues = watch(page)
  await instrument(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-C2BACK-${stamp()}`
  const pbi = await mkPbi(page, tag)
  await page.goto(`${BACKLOG}?q=${tag}`)
  await page.getByRole("button", { name: tag }).click()
  const dlg = page.getByRole("dialog", { name: tag })
  await expect(dlg).toBeVisible()
  await expect(page).toHaveURL(/pbi=/)
  await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("dirty-back")
  const lenBefore = await page.evaluate(() => history.length)
  await page.goBack().catch((e) => console.log("goBack err", String(e).slice(0, 120)))
  await page.waitForTimeout(1200)
  const guard = page.getByText(guardText)
  const facts = {
    url: page.url(),
    lenBefore,
    lenAfter: await page.evaluate(() => history.length),
    modal: await dlg.isVisible(),
    guard: await guard.first().isVisible().catch(() => false),
    hist: await page.evaluate(() => (window as unknown as { __hist: string[] }).__hist),
  }
  console.log("F-02 goBack:", JSON.stringify(facts))
  await page.screenshot({ path: `${SHOTS}/c2-pbi-dirty-back.png` })

  // Fixed (cycle 2): Back asks; cancel keeps the modal, its ?pbi= URL and the edits.
  expect(facts.guard).toBe(true)
  expect(facts.modal).toBe(true)
  const confirmDlg = page.getByRole("alertdialog")
  await confirmDlg.getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg.getByRole("textbox", { name: "PO メモ" })).toHaveValue("dirty-back")
  expect(page.url()).toContain("pbi=")
  // Back again → discard: the modal closes and the URL loses ?pbi=.
  await page.goBack().catch(() => undefined)
  await expect(guard.first()).toBeVisible()
  await confirmDlg.getByRole("button", { name: /破棄/ }).click()
  await expect(dlg).toBeHidden()
  await expect(page).not.toHaveURL(/pbi=/)
  expect((await api(page, "GET", `/api/projects/${PROJECT}/backlog/${pbi.id}`)).body?.poNote ?? null).not.toBe("dirty-back")
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("c2-back", issues)
})

test("F-02 Back on a dirty PBI via deep link (?pbi= opened directly, then 編集)", async ({ page }) => {
  const issues = watch(page)
  await instrument(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-C2BACK2-${stamp()}`
  const pbi = await mkPbi(page, tag)
  await page.goto(`${BACKLOG}?q=${tag}`)
  await page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
  const dlg = page.getByRole("dialog", { name: tag })
  await expect(dlg).toBeVisible()
  await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "PO メモ" }).fill("dirty-deeplink")
  let sawBeforeUnload = false
  page.once("dialog", async (d) => {
    sawBeforeUnload = d.type() === "beforeunload"
    await d.dismiss()
  })
  await page.goBack({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(1000)
  const deepGuard = await page.getByText(guardText).first().isVisible().catch(() => false)
  console.log("F-02 deep-link Back: url", page.url(), "beforeunload", sawBeforeUnload, "modal", await dlg.isVisible(), "guard", deepGuard)
  // Protected either by the in-app confirm or (a Back that crosses a document load) by beforeunload.
  expect(sawBeforeUnload || deepGuard).toBe(true)
  if (deepGuard) await page.getByRole("alertdialog").getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg.getByRole("textbox", { name: "PO メモ" })).toHaveValue("dirty-deeplink")
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("c2-back-deeplink", issues)
})

test("F-02 Back with a dirty create modal", async ({ page }) => {
  const issues = watch(page)
  await instrument(page)
  await login(page, "po")
  await page.goto("/me")
  await page.goto(BACKLOG)
  await expect(page.locator("[data-dnd-row]").first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  const dlg = page.getByRole("dialog", { name: "PBI追加" })
  await expect(dlg).toBeVisible()
  await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill("E2E-C2-CREATE-BACK")
  let sawBeforeUnload = false
  page.once("dialog", async (d) => {
    sawBeforeUnload = d.type() === "beforeunload"
    await d.dismiss()
  })
  await page.goBack({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(1000)
  console.log("F-02 create Back: beforeunload", sawBeforeUnload)
  const createGuard = await page.getByText(guardText).first().isVisible().catch(() => false)
  console.log("F-02 create Back: url", page.url(), "modal", await dlg.isVisible(), "guard", createGuard,
    "hist", JSON.stringify(await page.evaluate(() => (window as unknown as { __hist?: string[] }).__hist ?? [])))
  expect(sawBeforeUnload || createGuard).toBe(true)
  if (createGuard) await page.getByRole("alertdialog").getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg.getByRole("textbox", { name: "イニシアティブ" })).toHaveValue("E2E-C2-CREATE-BACK")
  report("c2-back-create", issues)
})

test("F-02 Back with a dirty create modal after in-app navigation (sidebar link → backlog)", async ({ page }) => {
  const issues = watch(page)
  await instrument(page)
  await login(page, "po")
  await page.goto(`/projects/${PROJECT}`)
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "プロダクトバックログ" }).click()
  await expect(page).toHaveURL(/\/backlog/)
  await expect(page.locator("[data-dnd-row]").first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole("main").getByRole("button", { name: "PBI追加" }).first().click()
  const dlg = page.getByRole("dialog", { name: "PBI追加" })
  await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill("E2E-C2-CREATE-BACK2")
  await page.goBack({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(1500)
  const guard = page.getByText(guardText).first()
  const facts = { url: page.url(), modal: await dlg.isVisible(), guard: await guard.isVisible().catch(() => false),
    hist: await page.evaluate(() => (window as unknown as { __hist?: string[] }).__hist ?? []) }
  console.log("F-02 create in-app Back:", JSON.stringify(facts))
  await page.screenshot({ path: `${SHOTS}/c2-create-dirty-back.png` })
  // Fixed (cycle 2): the confirm appears and the backlog (with the create modal) stays.
  expect(facts.guard).toBe(true)
  expect(facts.modal).toBe(true)
  expect(facts.url).toMatch(/\/backlog/)
  await page.getByRole("alertdialog").getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg.getByRole("textbox", { name: "イニシアティブ" })).toHaveValue("E2E-C2-CREATE-BACK2")
  await expect(page).toHaveURL(/\/backlog/)
  await page.goBack({ timeout: 5000 }).catch(() => undefined)
  await expect(guard).toBeVisible()
  await page.getByRole("alertdialog").getByRole("button", { name: /破棄/ }).click()
  await expect(page).not.toHaveURL(/\/backlog/)
  console.log("after discard: url", page.url())
  report("c2-back-create-inapp", issues)
})

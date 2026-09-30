import { expect, test, type Page } from "@playwright/test"
import { PROJECT, SHOTS, api, bar, createItem, deleteItem, getPlan, gotoPlan, patchItem, report, row, stamp, userPage, type Item } from "./plan-support"

/**
 * Progress model: manual statuses → %, duration-weighted parents, PBI-linked
 * leaves (link dialog, move warning, backlog status change → plan), sprint
 * bands + "PBI x/y" chip, schedule states; PBI side (detail link, picker, ?plan=).
 */
test.describe.configure({ mode: "serial" })

let s = ""
let P: Item, L1: Item, L2: Item, M: Item
let late: Item, risk: Item, hold: Item
const pbis: { id: string; displayId: number; title: string; points: number }[] = []
const find = async (page: Page, id: string) => (await getPlan(page)).items.find((i) => i.id === id)!

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  s = stamp()
  P = await createItem(page, { name: `E2E-P${s} 進捗親`, plannedStart: "2026-10-01", plannedEnd: "2026-10-15" })
  L1 = await createItem(page, { name: `E2E-P${s} L1 10日`, parentId: P.id, plannedStart: "2026-10-01", plannedEnd: "2026-10-10" })
  L2 = await createItem(page, { name: `E2E-P${s} L2 5日`, parentId: P.id, plannedStart: "2026-10-11", plannedEnd: "2026-10-15" })
  M = await createItem(page, { name: `E2E-P${s} MS`, parentId: P.id, plannedStart: "2026-10-15", plannedEnd: "2026-10-15", isMilestone: true })
  for (const [i, pts] of [[1, 3], [2, 5], [3, 2]] as const) {
    const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { userStory: `E2E-P${s} pbi${i}`, workloadScore: pts, status: "ready" })
    const d = r.body?.data ?? r.body
    if (r.status >= 300) throw new Error(`pbi create ${r.status} ${JSON.stringify(r.body)}`)
    pbis.push({ id: d.id, displayId: d.displayId, title: `E2E-P${s} pbi${i}`, points: pts })
  }
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: pbis.map((p) => p.id) })
  for (const it of [P, late, risk, hold]) if (it) await deleteItem(page, it.id)
  await ctx.close()
})

test("manual statuses → %, parent = duration-weighted average", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  expect((await patchItem(page, L1.id, { status: "in_progress" })).status).toBeLessThan(300)
  expect((await patchItem(page, L2.id, { status: "done" })).status).toBeLessThan(300)
  const p = await find(page, P.id)
  // (50*10 + 100*5) / 15 = 66.7 → 67 (milestone weight 0)
  console.log("parent pct/status", p.progressPct, p.status, p.scheduleState)
  expect(p.progressPct).toBe(67)
  expect(p.status).toBe("in_progress")
  await gotoPlan(page)
  // cycle 2: default columns are 期間 + 進捗; the status column is opt-in
  const pct = (id: string) => row(page, id).getByRole("cell").filter({ hasText: /^\d+%$/ })
  await expect(pct(P.id)).toHaveText("67%")
  await expect(pct(L1.id)).toHaveText("50%")
  await expect(pct(L2.id)).toHaveText("100%")
  await page.getByRole("button", { name: "表示する列" }).click()
  await page.getByRole("checkbox", { name: /ステータス|状態/ }).check()
  await page.keyboard.press("Escape")
  await expect(row(page, L2.id).getByRole("cell").filter({ hasText: /^完了$/ })).toHaveCount(1)
  await row(page, P.id).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/50-manual-progress.png` })
  await page.evaluate((key) => localStorage.removeItem(key), `kanflow:plan:${PROJECT}`)
  report("manual", issues)
  await ctx.close()
})

test("link PBIs via dialog (PBI連動), move warning, progress by points", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  // pbi3 is already linked to L2 → linking it to L1 must warn "moved from another item".
  const r = await api(page, "PUT", `/api/projects/${PROJECT}/plan/${L2.id}/links`, { pbiIds: [pbis[2].id] })
  expect(r.status).toBeLessThan(300)
  await gotoPlan(page)
  await row(page, L1.id).hover()
  await page.getByRole("button", { name: `E2E-P${s} L1 10日 の操作` }).click()
  await page.getByRole("menuitem", { name: "PBIをリンク" }).click()
  const d = page.getByRole("dialog")
  await expect(d.getByRole("heading", { name: "計画項目を編集" })).toBeVisible()
  await d.getByRole("radio", { name: "PBI連動" }).check()
  await d.getByPlaceholder("PBI を検索（番号・タイトル）").fill(`E2E-P${s}`)
  for (const p of pbis) await expect(d.getByText(p.title)).toBeVisible()
  await expect(d.getByText(`「E2E-P${s} L2 5日」からこの項目へ移動します`)).toBeVisible()
  for (const p of pbis) await d.getByRole("checkbox", { name: new RegExp(p.title) }).check()
  await expect(d.getByText("1 件の PBI が他の計画項目から移動します")).toBeVisible()
  // search by number
  await d.getByPlaceholder("PBI を検索（番号・タイトル）").fill(`#${pbis[0].displayId}`)
  await expect(d.getByText(pbis[0].title).last()).toBeVisible()
  const numResults = await d.locator("ul[aria-busy] li").count()
  console.log(`search '#${pbis[0].displayId}' results:`, numResults)
  await page.screenshot({ path: `${SHOTS}/51-link-dialog.png`, fullPage: true })
  await d.getByRole("button", { name: "保存" }).click()
  await expect(d).toHaveCount(0)
  await expect.poll(async () => (await find(page, L1.id)).linked?.pbiCount ?? 0).toBe(3)
  const l1 = await find(page, L1.id)
  console.log("L1 after link", JSON.stringify({ mode: l1.progressMode, pct: l1.progressPct, st: l1.status, ss: l1.scheduleState, linked: l1.linked }))
  expect(l1.progressMode).toBe("linked")
  expect(l1.progressPct).toBe(0)
  expect((await find(page, L2.id)).linked?.pbiCount ?? 0).toBe(0)
  // Chip on the bar + derived badges in editor
  await expect(row(page, L1.id).getByText("PBI 0/3")).toBeVisible()
  await bar(page, L1.id).dblclick()
  await expect(d.getByText("進捗とステータスはリンクした PBI から算出されます。")).toBeVisible()
  const auto = await d.getByText("自動", { exact: true }).count()
  console.log("linked leaf 自動 badges:", auto)
  expect(auto).toBeGreaterThanOrEqual(2)
  await expect(d.getByRole("link", { name: "バックログで表示" })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/52-linked-editor.png`, fullPage: true })
  await d.getByRole("button", { name: "キャンセル" }).click()
  report("link", issues)
  await ctx.close()
})

test("backlog status change of a linked PBI updates plan progress", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto(`/projects/${PROJECT}/backlog?q=${encodeURIComponent(`E2E-P${s}`)}`)
  const card = page.locator("[data-dnd-row]").filter({ hasText: pbis[1].title })
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.getByRole("button", { name: "完了にする" }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/53-backlog-complete.png` })
  await expect.poll(async () => (await find(page, L1.id)).linked?.pbiDone ?? 0, { timeout: 15_000 }).toBe(1)
  const l1 = await find(page, L1.id)
  console.log("L1 after pbi2 done", l1.progressPct, l1.status, l1.scheduleState)
  expect(l1.progressPct).toBe(50) // 5 of 10 points
  expect(l1.status).toBe("in_progress")
  const p = await find(page, P.id)
  console.log("parent after", p.progressPct) // (50*10 + 0*5)/15 = 33
  await gotoPlan(page)
  await expect(row(page, L1.id).getByText("PBI 1/3")).toBeVisible()
  await expect(row(page, L1.id).getByRole("cell").filter({ hasText: /^\d+%$/ })).toHaveText("50%")
  report("backlog→plan", issues)
  await ctx.close()
})

test("sprint band on bar for PBIs in a sprint", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  const sr = await api(page, "GET", `/api/projects/${PROJECT}/sprints`)
  const sprints = (sr.body?.data ?? sr.body) as any[]
  const list = Array.isArray(sprints) ? sprints : (sprints as any)?.sprints ?? []
  console.log("sprints:", JSON.stringify(list.map((x: any) => ({ id: x.id, name: x.name, s: x.startDate, e: x.endDate, st: x.status })).slice(-4)))
  const target = list.find((x: any) => x.status === "active") ?? list[list.length - 1]
  test.skip(!target, "no sprint")
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "addToSprint", ids: [pbis[0].id], payload: { sprintId: target.id } })
  console.log("addToSprint", r.status, JSON.stringify(r.body).slice(0, 200))
  const l1 = await find(page, L1.id)
  console.log("L1 linked after sprint", JSON.stringify(l1.linked))
  await gotoPlan(page)
  const band = row(page, L1.id).locator("[data-plan-sprint]")
  await expect(band.first()).toBeAttached()
  console.log("band title:", await band.first().getAttribute("title"))
  await page.getByRole("button", { name: "表を名前だけにする" }).click()
  await row(page, L1.id).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/54-sprint-band.png` })
  await page.getByRole("button", { name: "表の列を表示" }).click()
  report("sprint band", issues)
  await ctx.close()
})

test("schedule states: past due → 遅延, behind → 遅延リスク, 保留 not delayed", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  late = await createItem(page, { name: `E2E-P${s} 期限切れ`, plannedStart: "2026-09-01", plannedEnd: "2026-09-20" })
  risk = await createItem(page, { name: `E2E-P${s} 遅れ気味`, plannedStart: "2026-09-20", plannedEnd: "2026-10-10" })
  hold = await createItem(page, { name: `E2E-P${s} 保留中`, plannedStart: "2026-09-01", plannedEnd: "2026-09-20" })
  // risk: 0% while 11/21 days (52%) elapsed → at risk
  await patchItem(page, hold.id, { status: "on_hold" })
  const plan = await getPlan(page)
  const st = (id: string) => plan.items.find((i) => i.id === id)!
  console.log("states", st(late.id).scheduleState, st(risk.id).scheduleState, st(risk.id).progressPct, st(hold.id).scheduleState)
  expect(st(late.id).scheduleState).toBe("delayed")
  expect(st(risk.id).scheduleState).toBe("at_risk") // 50% vs 11/21 elapsed = 52% → not at risk? printed
  expect(st(hold.id).scheduleState).toBe("on_hold")
  await gotoPlan(page)
  await page.getByRole("button", { name: "表示する列" }).click()
  await page.getByRole("checkbox", { name: /ステータス|状態/ }).check()
  await page.keyboard.press("Escape")
  await expect(row(page, late.id).getByRole("cell").filter({ hasText: /^遅延$/ })).toHaveCount(1)
  await expect(row(page, hold.id).getByRole("cell").filter({ hasText: /^保留$/ })).toHaveCount(1)
  // Filter by 遅延 excludes on-hold item
  await page.getByLabel("状態").selectOption({ label: "遅延" })
  await expect(row(page, late.id)).toBeVisible()
  await expect(row(page, hold.id)).toHaveCount(0)
  await page.getByRole("button", { name: "絞り込みを解除" }).click()
  await row(page, hold.id).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/55-schedule-states.png` })
  await page.evaluate((key) => localStorage.removeItem(key), `kanflow:plan:${PROJECT}`)
  report("schedule", issues)
  await ctx.close()
})

test("PBI side: detail link → plan?item=, backlog ?plan= chip, edit plan picker", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  // backlog ?plan= filter chip
  await page.goto(`/projects/${PROJECT}/backlog?plan=${L1.id}`)
  const chip = page.getByRole("button", { name: new RegExp(`全体計画: E2E-P${s} L1 10日`) })
  await expect(chip).toBeVisible({ timeout: 30_000 })
  const cards = page.locator("[data-dnd-row]")
  const titles = await cards.allInnerTexts()
  console.log("?plan= visible cards:", titles.length, "completed section may hide pbi2")
  await page.screenshot({ path: `${SHOTS}/56-backlog-plan-chip.png` })
  // PBI detail
  await page.goto(`/projects/${PROJECT}/backlog?pbi=${pbis[0].displayId}`)
  const d = page.getByRole("dialog")
  const link = d.getByRole("link", { name: `全体計画で「E2E-P${s} L1 10日」を開く` })
  await expect(link).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/57-pbi-detail-plan-link.png` })
  await link.click()
  await expect(page).toHaveURL(/\/plan/)
  const ed = page.getByRole("dialog")
  await expect(ed.getByRole("heading", { name: "計画項目を編集" })).toBeVisible({ timeout: 30_000 })
  await expect(ed.getByLabel(/項目名/)).toHaveValue(`E2E-P${s} L1 10日`)
  await expect(page).not.toHaveURL(/item=/)
  await page.screenshot({ path: `${SHOTS}/58-plan-item-deeplink.png` })
  await page.keyboard.press("Escape")
  // PBI edit: plan picker → move pbi1 to L2
  await page.goto(`/projects/${PROJECT}/backlog?pbi=${pbis[0].displayId}`)
  await page.getByRole("dialog").getByRole("button", { name: /編集/ }).first().click()
  const picker = page.getByRole("dialog").getByRole("combobox", { name: /全体計画/ })
  await expect(picker).toBeVisible()
  const t0 = Date.now()
  await expect.poll(() => picker.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1)
  console.log("picker options loaded after ms:", Date.now() - t0)
  const opts = await picker.locator("option").evaluateAll((os) => os.map((o) => `${(o as HTMLOptionElement).disabled ? "[x]" : ""}${o.textContent}`))
  console.log("picker options (first 12):", JSON.stringify(opts.slice(0, 12)))
  expect(opts.find((o) => o.includes(`E2E-P${s} 進捗親`))?.startsWith("[x]")).toBeTruthy()
  await picker.selectOption(L2.id)
  await page.screenshot({ path: `${SHOTS}/59-pbi-plan-picker.png` })
  await page.getByRole("dialog").getByRole("button", { name: "更新" }).click()
  await expect.poll(async () => (await find(page, L2.id)).linked?.pbiCount ?? 0, { timeout: 15_000 }).toBe(1)
  report("pbi side", issues)
  await ctx.close()
})

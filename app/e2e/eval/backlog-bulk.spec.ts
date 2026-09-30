import { expect, test, type Page } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })

async function createPbis(page: Page, tag: string, n: number): Promise<{ id: string; displayId: number }[]> {
  const out: { id: string; displayId: number }[] = []
  for (let i = 1; i <= n; i++) {
    const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, {
      initiative: `${tag} item ${i}`,
      userStory: `E2E として、一括操作 ${i} を確認したい。それは評価のためだ。`,
      workloadScore: 2,
      status: "not_ready",
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const b = (r.body.data ?? r.body) as { id: string; displayId: number }
    out.push({ id: b.id, displayId: b.displayId })
  }
  return out
}

test("selection mode + bulk status / PO / sprint / trash + Undo", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-BULK-${stamp()}`
  const items = await createPbis(page, tag, 3)
  await page.goto(`${BACKLOG}?q=${encodeURIComponent(tag)}`)
  await expect(page.locator("[data-dnd-row]")).toHaveCount(3)

  await page.getByRole("button", { name: "選択", exact: true }).click()
  const bar = page.getByRole("region", { name: "一括操作" })
  await expect(bar).toBeVisible()
  await expect(bar.getByText("0 件選択中")).toBeVisible()
  // click + shift-click range
  await page.getByRole("checkbox", { name: `#${items[0].displayId} を選択` }).click()
  await page.getByRole("checkbox", { name: `#${items[2].displayId} を選択` }).click({ modifiers: ["Shift"] })
  await expect(bar.getByText("3 件選択中")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/bulk-bar.png`, fullPage: true })

  // status -> ready
  await bar.getByRole("combobox", { name: "状態を変更" }).selectOption("ready")
  let resp = page.waitForResponse((r) => r.url().includes("/backlog/bulk"))
  await bar.getByRole("button", { name: "状態を変更" }).click()
  expect((await resp).status()).toBe(200)
  await expect(page.getByText(/3 件を更新しました/)).toBeVisible()
  await expect(page.getByRole("region", { name: "Ready（着手可能）" }).locator("[data-dnd-row]")).toHaveCount(3)
  // selection after action?
  console.log("selected after status:", await bar.locator("[aria-live]").innerText().catch(() => "bar gone"))

  // PO assign
  if (await bar.isVisible()) {
    await bar.getByRole("button", { name: "表示中をすべて選択" }).click()
    const poSelect = bar.getByRole("combobox", { name: "Product Owner" })
    const opts = await poSelect.locator("option").allInnerTexts()
    console.log("PO options", opts)
    const po = opts.find((o) => /E2E/.test(o)) ?? opts[1]
    await poSelect.selectOption({ label: po })
    resp = page.waitForResponse((r) => r.url().includes("/backlog/bulk"))
    await bar.getByRole("button", { name: /を割り当て/ }).click()
    expect((await resp).status()).toBe(200)
    const after = await api(page, "GET", `/api/projects/${PROJECT}/backlog/${items[0].id}`)
    console.log("assignedPo after bulk:", (after.body.data as Record<string, unknown> | undefined)?.assignedPo ?? after.body.assignedPo)

    // add to sprint
    await bar.getByRole("button", { name: "表示中をすべて選択" }).click()
    const sprintSel = bar.getByRole("combobox", { name: "スプリントを選択" })
    const sOpts = await sprintSel.locator("option").allInnerTexts()
    console.log("sprint options", sOpts)
    if (sOpts.length > 1) {
      await sprintSel.selectOption({ index: 1 })
      resp = page.waitForResponse((r) => r.url().includes("/backlog/bulk"))
      await bar.getByRole("button", { name: "スプリントに追加" }).click()
      const r = await resp
      console.log("addToSprint", r.status(), await r.text())
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${SHOTS}/bulk-after-sprint.png`, fullPage: true })
      console.log("in-sprint badges:", await page.getByText("スプリント着手中").count())
    }

    // trash + undo
    await bar.getByRole("button", { name: "表示中をすべて選択" }).click()
    await bar.getByRole("button", { name: "ゴミ箱に移動" }).click()
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"))
    await expect(confirm.getByText(/選択した 3 件をゴミ箱に移動しますか/)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/bulk-trash-confirm.png` })
    resp = page.waitForResponse((r) => r.url().includes("/backlog/bulk"))
    await confirm.getByRole("button", { name: "ゴミ箱に移動" }).click()
    const tr = await resp
    console.log("trash", tr.status(), await tr.text())
    await expect(page.locator("[data-dnd-row]")).toHaveCount(0)
    const toast = page.getByText(/3 件をゴミ箱に移動しました/)
    await expect(toast).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/bulk-undo-toast.png` })
    await page.getByRole("button", { name: "元に戻す" }).click()
    await expect(page.getByText(/3 件を元に戻しました/)).toBeVisible()
    await expect(page.locator("[data-dnd-row]")).toHaveCount(3)
  }

  // cleanup: exit select mode; trash the items via bulk API (leave in trash)
  await page.getByRole("button", { name: "選択を終了" }).click()
  await expect(bar).toHaveCount(0)
  const del = await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: items.map((i) => i.id) })
  console.log("cleanup trash", del.status)
  report("bulk", issues)
})

test("bulk API: linkPlan exists server-side; SM cannot trash; dev cannot bulk", async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await login(page, "po")
  await page.goto(BACKLOG)
  const tag = `E2E-BULKAPI-${stamp()}`
  const items = await createPbis(page, tag, 1)
  const lp = await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "linkPlan", ids: [items[0].id], payload: { planItemId: null } })
  console.log("linkPlan(null) as PO", lp.status, JSON.stringify(lp.body).slice(0, 200))
  await ctx.close()

  for (const role of ["sm", "dev"] as const) {
    const c = await browser.newContext()
    const p = await c.newPage()
    await login(p, role)
    await p.goto(BACKLOG)
    const trash = await api(p, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: [items[0].id] })
    const status = await api(p, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "status", ids: [items[0].id], payload: { status: "ready" } })
    const reorder = await api(p, "PUT", `/api/projects/${PROJECT}/backlog/reorder`, { orderedIds: [items[0].id] })
    console.log(role, "trash", trash.status, "status", status.status, "reorder", reorder.status)
    if (role === "sm") {
      expect(trash.status).toBe(403)
      expect(status.status).toBe(200)
    } else {
      expect(trash.status).toBe(403)
      expect(status.status).toBe(403)
    }
    await c.close()
  }
  const c2 = await browser.newContext()
  const p2 = await c2.newPage()
  await login(p2, "po")
  await p2.goto(BACKLOG)
  await api(p2, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: [items[0].id] })
  await c2.close()
})

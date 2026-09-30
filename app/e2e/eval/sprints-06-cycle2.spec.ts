import { devices, expect, test, type Browser, type Page } from "@playwright/test"
import { IOT, USERS, api, japaneseStrings, loginAs, newUserPage, readState, report, shot, watch } from "./sprints-support"

/**
 * Cycle 2 re-verification of the sprints findings S-02, S-03, S-04/S-11, S-06, S-07,
 * S-08, S-12, S-13, S-14, S-15 plus regression checks of home / dashboard.
 * No AI requests: reports are only expanded (read), never generated.
 */

async function savedLanguage(page: Page): Promise<string> {
  const r = await api<{ language?: string }>(page, "GET", "/api/user/language")
  return `${r.status}:${r.body.language ?? JSON.stringify(r.body)}`
}

async function loginUntouched(browser: Browser, locale?: string) {
  const ctx = await browser.newContext(locale ? { locale } : {})
  const page = await ctx.newPage()
  const issues = watch(page)
  await page.goto("/login")
  const loginLang = await page.locator("html").getAttribute("lang")
  const pressed = await page.locator("button[aria-pressed=true]").first().innerText()
  await loginAs(page, "dev", null)
  await page.waitForLoadState("networkidle")
  const appLang = await page.locator("html").getAttribute("lang")
  return { ctx, page, issues, loginLang, pressed: pressed.split(/\s/)[0], appLang }
}

test("S-02: e2e-dev keeps 'id' across logins that do not touch the language pills", async ({ browser }) => {
  // make sure the saved default is id first (explicit choice, like a real user would once)
  const first = await newUserPage(browser, "dev", {})
  console.log("after explicit ID login:", await savedLanguage(first.page))
  await first.ctx.close()

  const results: string[] = []
  for (const locale of [undefined, "ja-JP", "en-US", undefined]) {
    const r = await loginUntouched(browser, locale)
    const saved = await savedLanguage(r.page)
    const h1 = await r.page.locator("h1").first().innerText().catch(() => "")
    results.push(`locale=${locale ?? "default"} loginPage=${r.loginLang}/${r.pressed} app=${r.appLang} saved=${saved} h1=${h1}`)
    expect(r.appLang, `app language after untouched login (${locale})`).toBe("id")
    expect(saved).toBe("200:id")
    await r.ctx.close()
  }
  console.log("untouched logins:\n" + results.join("\n"))

  // same browser: logout through the avatar menu → login page now starts in ID (cookie)
  const ctx = await browser.newContext({ locale: "ja-JP" })
  const page = await ctx.newPage()
  await loginAs(page, "dev", null)
  await page.goto("/")
  const avatar = page.getByRole("banner").getByRole("button", { name: /E2E Dev|Menu pengguna|akun/i }).last()
  await avatar.click()
  await shot(page, "c2-user-menu-desktop", false)
  const menuText = await page.locator("[role=menu], [id][class*=shadow]").filter({ hasText: /Keluar/ }).first().innerText().catch(() => "")
  console.log("user menu text:", menuText.replace(/\n/g, " | "))
  await page.getByRole("button", { name: /^Keluar/ }).or(page.getByRole("menuitem", { name: /^Keluar/ })).first().click()
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
  await page.waitForLoadState("networkidle")
  const lang = await page.locator("html").getAttribute("lang")
  const cookie = (await ctx.cookies()).find((c) => c.name === "kanflow_lang")?.value
  console.log(`login page after logout: lang=${lang} cookie=${cookie}`)
  expect(lang).toBe("id")
  await shot(page, "c2-login-after-logout", false)
  await ctx.close()
})

async function headerOverlaps(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header")
    if (!header) return { items: [], overlaps: ["no header"], offscreen: [] as string[] }
    const els = [...header.querySelectorAll("a,button,[role=button]")].filter((e) => {
      const r = e.getBoundingClientRect()
      const st = getComputedStyle(e)
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"
    })
    const name = (e: Element) => (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.tagName).trim().slice(0, 30)
    const rects = els.map((e) => ({ n: name(e), r: e.getBoundingClientRect() }))
    const overlaps: string[] = []
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r, b = rects[j].r
        // nested elements (e.g. button inside link) are not overlaps
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (w > 1 && h > 1) overlaps.push(`${rects[i].n} × ${rects[j].n} (${Math.round(w)}x${Math.round(h)})`)
      }
    const vw = document.documentElement.clientWidth
    const offscreen = rects.filter((x) => x.r.right > vw + 1 || x.r.left < -1).map((x) => x.n)
    const small = rects.filter((x) => x.r.width < 24 || x.r.height < 24).map((x) => `${x.n} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`)
    return { items: rects.map((x) => `${x.n}@${Math.round(x.r.left)},${Math.round(x.r.top)} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`), overlaps, offscreen, small }
  })
}

for (const [label, device] of [["375", { ...devices["iPhone 13 Mini"], viewport: { width: 375, height: 812 } }], ["412", devices["Pixel 7"]]] as const) {
  test(`S-04/S-11: mobile header + page overflow at ${label}px`, async ({ browser }) => {
    const s = readState()
    const { ctx, page, issues } = await newUserPage(browser, "dev", { ...device })
    const pages: Array<[string, string]> = [
      ["home", "/"],
      ["dashboard", `/projects/${s.projectId}`],
      ["board", `/projects/${s.projectId}/sprints?view=board`],
      ["list", `/projects/${s.projectId}/sprints?view=list`],
      ["burndown", `/projects/${s.projectId}/burndown`],
      ["gantt", `/projects/${IOT}/gantt`],
    ]
    for (const [name, url] of pages) {
      await page.goto(url)
      await page.waitForLoadState("networkidle")
      await page.waitForTimeout(800)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 0) {
        const culprits = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth
          return [...document.querySelectorAll("body *")].filter((e) => {
            const r = e.getBoundingClientRect()
            return r.right > vw + 1 && r.width > 0 && ![...e.children].some((c) => c.getBoundingClientRect().right > vw + 1)
          }).slice(0, 8).map((e) => `${e.tagName}.${String(e.className).slice(0, 80)} right=${Math.round(e.getBoundingClientRect().right)} text=${(e as HTMLElement).innerText?.slice(0, 40)}`)
        })
        console.log(`[${label}] ${name} overflow culprits:`, JSON.stringify(culprits, null, 1))
        await page.screenshot({ path: `D:/APP/Kanflow-e2e/reports/shots/sprints-c2-mobile${label}-${name}-full.png`, fullPage: true })
      }
      const h = await headerOverlaps(page)
      console.log(`[${label}] ${name}: overflow=${overflow}px overlaps=${JSON.stringify(h.overlaps)} offscreen=${JSON.stringify(h.offscreen)} small=${JSON.stringify(h.small)}`)
      if (name === "board") console.log(`[${label}] header items: ${JSON.stringify(h.items)}`)
      await shot(page, `c2-mobile${label}-${name}`, false)
      expect.soft(h.overlaps, `${name} header overlaps`).toEqual([])
      expect.soft(overflow, `${name} horizontal overflow`).toBeLessThanOrEqual(0)
    }
    // user menu holds the header items that do not fit + logout
    await page.goto(`/projects/${s.projectId}/sprints?view=board`)
    const avatar = page.getByRole("button", { name: /^Menu pengguna/ })
    await avatar.click()
    await page.waitForTimeout(400)
    await shot(page, `c2-mobile${label}-user-menu`, false)
    const expanded = await avatar.getAttribute("aria-expanded")
    const panel = await page.evaluate(() => {
      const b = [...document.querySelectorAll("header button[aria-expanded=true]")].pop()
      const id = b?.getAttribute("aria-controls")
      const el = id ? document.getElementById(id) : null
      if (!el) return { text: "(no panel)", rect: null }
      const r = el.getBoundingClientRect()
      return { text: (el as HTMLElement).innerText, rect: { l: Math.round(r.left), r: Math.round(r.right), vw: document.documentElement.clientWidth } }
    })
    console.log(`[${label}] avatar expanded=${expanded} panel=${JSON.stringify(panel.rect)} text=${panel.text.replace(/\n/g, " | ")}`)
    expect(panel.text).toMatch(/Keluar/)
    await page.keyboard.press("Escape")
    report(`mobile ${label}`, issues)
    await ctx.close()
  })
}

test("S-03: dev sees no sprint/goal management controls; API still 403", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "dev")
  await page.goto(`/projects/${s.projectId}/sprints`)
  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 })
  const create = await page.getByRole("button", { name: /Buat Sprint/ }).count()
  const addTask = await page.getByRole("button", { name: "Tambah tugas", exact: true }).count()
  console.log(`dev sprints page: create-sprint buttons=${create}, 'Tambah tugas' buttons=${addTask}`)
  await shot(page, "c2-dev-sprints")
  await page.goto(`/projects/${s.projectId}`)
  await page.waitForLoadState("networkidle")
  const addGoal = await page.getByRole("button", { name: /Tambah Tujuan/ }).count()
  console.log(`dev dashboard: 'Tambah Tujuan' buttons=${addGoal}`)
  expect(create).toBe(0)
  expect(addGoal).toBe(0)
  const patch = await api(page, "PATCH", `/api/projects/${s.projectId}/sprints/${s.sprintId}`, { capacity: 30 })
  console.log("dev PATCH sprint status:", patch.status)
  expect(patch.status).toBe(403)
  report("dev controls", issues)
  await ctx.close()
})

test("S-06 / S-13 / S-15: labels on the PO sprint page (ja, 1280px)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "po", { viewport: { width: 1280, height: 800 } })
  await page.goto(`/projects/${s.projectId}/sprints?view=list`)
  const card = page.locator(`#sprint-card-${s.sprintId}`)
  await expect(card).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)
  const h1 = page.locator("h1").first()
  const h1Box = await h1.boundingBox()
  const lh = await h1.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight))
  console.log(`H1 '${await h1.innerText()}' height=${h1Box?.height} lineHeight=${lh}`)
  const progress = (await card.innerText()).split("\n").filter((l) => /業務負荷|消化|完了|タスク/.test(l)).slice(0, 8)
  console.log("progress rows:", JSON.stringify(progress))
  const plusTask = card.getByRole("button", { name: /タスク/ }).filter({ hasText: /タスク/ }).first()
  console.log("add-task button text:", JSON.stringify(await plusTask.innerText()), "svg:", await plusTask.locator("svg").count())
  await shot(page, "c2-po-list-1280", false)
  await page.goto(`/projects/${s.projectId}/sprints?view=board`)
  await page.waitForTimeout(1200)
  const colHead = await page.getByRole("region").filter({ hasText: "未着手" }).first().innerText().catch(() => "")
  console.log("board column header (ja):", colHead.split("\n").slice(0, 4).join(" | "))
  const cardText = await page.locator("[aria-roledescription], [data-task-id]").first().innerText().catch(() => "")
  console.log("first board card:", cardText.replace(/\n/g, " | "))
  const labels = await page.locator("main").innerText()
  console.log("hours labelled with point unit on board:", /ストーリーポイント|Story Points/.test(labels))
  await shot(page, "c2-po-board-1280", false)
  report("po labels", issues)
  await ctx.close()
})

test("S-07 / home regressions: (home) route group, KPIs, toolbar, AI titles", async ({ browser }) => {
  const { ctx, page, issues } = await newUserPage(browser, "dev")
  const resp = await page.goto("/")
  console.log("GET / status:", resp?.status(), "title:", await page.title())
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  await page.waitForLoadState("networkidle")
  const typeAll = await page.locator("main").getByRole("button", { name: /Semua/ }).allInnerTexts()
  console.log("home 'Semua…' buttons:", JSON.stringify(typeAll))
  const titled = await page.evaluate(() => [...document.querySelectorAll("[title]")].filter((e) => /[぀-ヿ㐀-鿿]/.test(e.getAttribute("title") ?? ""))
    .map((e) => `${e.tagName}.${(e.className || "").toString().slice(0, 40)} title=${e.getAttribute("title")} text=${(e as HTMLElement).innerText.slice(0, 60)} in=${e.closest("section,[aria-label]")?.getAttribute("aria-label") ?? e.closest("section")?.querySelector("h2")?.textContent ?? "?"}`))
  console.log("home elements with Japanese title attr (id user):", JSON.stringify(titled, null, 1))
  console.log("JP visible strings on home:", JSON.stringify(await japaneseStrings(page, "main")))
  await shot(page, "c2-home-dev")
  // client navigation home → project → home keeps working (route group)
  const projLink = page.locator("main a[href^='/projects/']").first()
  await projLink.click()
  await expect(page).toHaveURL(/\/projects\//)
  await page.getByRole("banner").getByRole("link", { name: /Kanflow|Beranda|Home/ }).first().click()
  await expect(page).toHaveURL(new URL("/", process.env.E2E_BASE_URL || "http://localhost:3102").href)
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  report("home dev", issues)
  await ctx.close()
})

test("S-12 / S-14: dashboard activity names and AI report language (read only)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "dev")
  await page.goto(`/projects/${s.projectId}`)
  const feed = page.getByRole("region", { name: "Aktivitas terbaru" })
  await expect(feed).toBeVisible({ timeout: 20_000 })
  await feed.getByRole("button", { name: /Tampilkan lebih/ }).click().catch(() => undefined)
  await page.waitForTimeout(800)
  const items = (await feed.getByRole("listitem").allInnerTexts()).map((t) => t.replace(/\s*\n+\s*/g, " ").trim())
  console.log("C2 feed moves/creates:", JSON.stringify(items.filter((t) => /memindahkan|membuat|menambahkan/.test(t)).slice(0, 10), null, 1))
  const bare = items.filter((t) => !/[“”]/.test(t))
  console.log("C2 feed items without a quoted name:", JSON.stringify(bare.slice(0, 10), null, 1))

  // S-14 — the C1 project holds a ja progress report and a JA/ID sprint review from cycle 1
  test.setTimeout(240_000)
  for (const [tag, pid] of [["c1", "cmunw54ax000go49lqxdvjzt1"], ["iot", IOT]] as const) {
    await page.goto(`/projects/${pid}`)
    await page.waitForLoadState("networkidle")
    const section = page.locator("section[aria-labelledby=ai-reports-heading]")
    await expect(section).toBeVisible({ timeout: 20_000 })
    const older = section.getByRole("button", { name: /lama|sebelumnya/i })
    if (await older.count()) await older.first().click()
    const rows = section.locator("button[aria-expanded]").filter({ hasNotText: /lama|sebelumnya|older/i })
    const n = Math.min(await rows.count(), 4)
    console.log(`AI report rows on ${tag} dashboard (dev, id):`, await rows.count(), JSON.stringify((await rows.allInnerTexts()).map((t) => t.replace(/\n/g, " | ").slice(0, 160))))
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click()
      await page.waitForTimeout(600)
      const id = await rows.nth(i).getAttribute("aria-controls")
      const body = id ? await page.locator(`[id="${id}"]`).innerText().catch(() => "") : ""
      const noteLoc = page.locator(`[id="${id}"] [data-testid=ai-report-language-note]`)
      const note = id && (await noteLoc.count()) ? await noteLoc.innerText() : ""
      const jp = body.split("\n").filter((l) => /[\u3040-\u30ff\u3400-\u9fff]/.test(l))
      console.log(`${tag} report ${i}: note='${note}' lines=${body.split("\n").length} jpLines=${jp.length} jp=${JSON.stringify(jp.slice(0, 5).map((l) => l.slice(0, 80)))} head=${body.slice(0, 120).replace(/\n/g, " / ")}`)
      if (i === 0) await page.screenshot({ path: `D:/APP/Kanflow-e2e/reports/shots/sprints-c2-ai-report-${tag}.png`, timeout: 10_000, animations: "disabled" }).catch((e) => console.log("shot failed", String(e).slice(0, 80)))
      await rows.nth(i).click()
    }
  }
  report("dashboard names/ai", issues)
  await ctx.close()
})

test("S-08: completion dialog summarizes unfinished work (review → open 完了 dialog → cancel)", async ({ browser }) => {
  const s = readState()
  const { ctx, page, issues } = await newUserPage(browser, "sm")
  const cur = await api<Array<{ id: string; status: string }>>(page, "GET", `/api/projects/${s.projectId}/sprints`)
  const status = cur.body.find((x) => x.id === s.sprintId)?.status
  test.skip(status !== "active" && status !== "review", `sprint is ${status}`)
  await page.goto(`/projects/${s.projectId}/sprints?view=list`)
  const c = page.locator(`#sprint-card-${s.sprintId}`)
  await expect(c).toBeVisible({ timeout: 30_000 })
  if (status === "active") {
    await c.getByRole("button", { name: "「レビュー」へ移行" }).click()
    const d0 = page.getByRole("dialog", { name: /スプリントステータス変更/ })
    await expect(d0).toBeVisible()
    const summary0 = await d0.getByTestId("sprint-completion-summary").count()
    console.log("review dialog shows completion summary:", summary0)
    await d0.getByRole("textbox", { name: /Keep/ }).fill("E2E C2 keep")
    await d0.getByRole("button", { name: "保存してステータス変更" }).click()
    await expect(d0).toBeHidden({ timeout: 15_000 })
  }
  await c.getByRole("button", { name: "「完了」へ移行" }).click()
  const dlg = page.getByRole("dialog", { name: /スプリントステータス変更/ })
  await expect(dlg).toBeVisible()
  const summary = dlg.getByTestId("sprint-completion-summary")
  await expect(summary).toBeVisible()
  console.log("completion summary:", (await summary.innerText()).replace(/\n/g, " | "))
  await shot(page, "c2-completion-dialog", false)
  await dlg.getByRole("button", { name: "キャンセル" }).click()
  await expect(dlg).toBeHidden()
  const after = await api<Array<{ id: string; status: string }>>(page, "GET", `/api/projects/${s.projectId}/sprints`)
  console.log("sprint status after cancel:", after.body.find((x) => x.id === s.sprintId)?.status)
  report("completion dialog", issues)
  await ctx.close()
  void USERS
})

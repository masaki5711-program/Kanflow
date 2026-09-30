/**
 * Platform eval (cycle 1): i18n, accessibility (axe), keyboard navigation, 375px responsive.
 *
 * Uses a throwaway admin (also dev member of the pilot project) so that the
 * UI-language switches do not disturb the shared e2e accounts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import * as fs from "node:fs"
import { apiFor, apiLogin, BASE, DATA, note, PILOT, shot } from "./platform-helpers"

test.describe.configure({ mode: "serial" })
test.setTimeout(900_000)

let email = ""
let storage: Awaited<ReturnType<Awaited<ReturnType<typeof apiLogin>>["storageState"]>>
let firstSprint = ""
const log: string[] = []

const PAGES = (): Array<[string, string]> => [
  ["home", "/"],
  ["dashboard", `/projects/${PILOT}`],
  ["backlog", `/projects/${PILOT}/backlog`],
  ["sprints", `/projects/${PILOT}/sprints`],
  ["plan", `/projects/${PILOT}/plan`],
  ["releases", `/projects/${PILOT}/releases`],
  ["settings", `/projects/${PILOT}/settings`],
  ["chat", `/projects/${PILOT}/chat`],
  ["portfolio", "/portfolio"],
  ["admin-metrics", "/admin/metrics"],
  ["admin-users", "/admin/users"],
  ["me", "/me"],
]

test.beforeAll(async () => {
  const admin = await apiFor("admin")
  email = `plat-ui-${Date.now()}@example.test`
  const r = await admin.post("/api/users", { data: { name: "Plat UI Admin", email, password: "E2e-Kanflow-2026!", role: "admin" } })
  expect(r.status()).toBe(201)
  const user = await r.json()
  await admin.post(`/api/projects/${PILOT}/members`, { data: { userId: user.id, role: "dev" } })
  const api = await apiLogin(email)
  storage = await api.storageState()
  const sprints = await (await api.get(`/api/projects/${PILOT}/sprints`)).json()
  firstSprint = sprints[0]?.id ?? ""
  fs.writeFileSync(`${DATA}/platform-ui-user.txt`, `${email} ${user.id}\n`)
})

async function newCtx(browser: import("@playwright/test").Browser, opts: Parameters<import("@playwright/test").Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE, storageState: storage, ...opts })
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(500)
}

const JA = /[぀-ヿ一-龯]/

/** Japanese text in UI chrome (buttons, headings, labels, table headers, placeholders, aria-labels) — data rows excluded as far as possible. */
async function chromeJapanese(page: Page): Promise<string[]> {
  return page.evaluate((re) => {
    const rx = new RegExp(re)
    const out = new Set<string>()
    const sel = "button, h1, h2, h3, label, th, nav a, [role=tab], summary, legend, option"
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("[data-user-content], article, li[data-pbi], .prose")) continue
      const txt = (el.innerText || "").trim().replace(/\s+/g, " ")
      if (txt && txt.length < 60 && rx.test(txt)) out.add(`${el.tagName.toLowerCase()}:${txt}`)
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[placeholder], [aria-label], [title]"))) {
      for (const a of ["placeholder", "aria-label", "title"]) {
        const v = el.getAttribute(a)
        if (v && v.length < 60 && rx.test(v)) out.add(`@${a}:${v}`)
      }
    }
    return Array.from(out).slice(0, 40)
  }, JA.source)
}

test("i18n: switch ja -> en (header) -> id (/me); untranslated chrome; 404 pages", async ({ browser }) => {
  const ctx = await newCtx(browser)
  const page = await ctx.newPage()
  await page.goto("/")
  await settle(page)
  // header language select (native <select>, label = navLanguageMenu)
  const select = page.locator("header select").first()
  await select.selectOption("en")
  await settle(page)
  log.push(`after header switch to en: h1/h2="${(await page.locator("h1,h2").first().textContent())?.trim()}"`)
  for (const [name, url] of PAGES()) {
    await page.goto(url)
    await settle(page)
    const ja = await chromeJapanese(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    log.push(`[en] ${name}: overflowX=${overflow}px; Japanese in chrome (${ja.length}): ${ja.slice(0, 12).join(" ¦ ")}`)
    await page.screenshot({ path: shot(`i18n-en-${name}`), fullPage: false })
  }
  // switch to id from /me buttons
  await page.goto("/me")
  await settle(page)
  await page.getByRole("button", { name: "Bahasa Indonesia", exact: true }).click()
  await settle(page)
  const lang = await (await page.request.get("/api/user/language")).json()
  log.push(`after /me switch to id: stored=${JSON.stringify(lang)}`)
  for (const [name, url] of PAGES()) {
    await page.goto(url)
    await settle(page)
    const ja = await chromeJapanese(page)
    log.push(`[id] ${name}: Japanese in chrome (${ja.length}): ${ja.slice(0, 12).join(" ¦ ")}`)
    await page.screenshot({ path: shot(`i18n-id-${name}`), fullPage: false })
  }
  // 404s in id, en, ja
  for (const lang of ["id", "en", "ja"]) {
    await page.request.patch("/api/user/language", { data: { language: lang } })
    for (const [n, url] of [["route", "/no-such-page-xyz"], ["project", "/projects/doesnotexist123"], ["sprint", `/projects/${PILOT}/sprints/nope`]]) {
      const res = await page.goto(url)
      await settle(page)
      const body = (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ").slice(0, 160)
      log.push(`[404 ${lang}] ${n} ${url} -> HTTP ${res?.status()} text="${body}"`)
      await page.screenshot({ path: shot(`404-${lang}-${n}`) })
    }
  }
  await ctx.close()
})

test("loading skeletons appear on slow navigation", async ({ browser }) => {
  const ctx = await newCtx(browser)
  const page = await ctx.newPage()
  await page.request.patch("/api/user/language", { data: { language: "ja" } })
  await page.goto(`/projects/${PILOT}`)
  await settle(page)
  // Delay RSC payloads + API calls so the route-level loading UI is visible
  await page.route("**/*", async (route) => {
    const u = route.request().url()
    if (u.includes("_rsc") || u.includes("/api/projects/")) await new Promise((r) => setTimeout(r, 2500))
    await route.continue().catch(() => {})
  })
  await page.locator("aside a, nav a").filter({ hasText: /プロダクトバックログ/ }).first().click()
  await page.waitForTimeout(700)
  const busy = await page.locator("[aria-busy=true], [role=status], .animate-pulse").count()
  log.push(`skeleton during slow nav to backlog: aria-busy/status/pulse elements=${busy}`)
  await page.screenshot({ path: shot("loading-skeleton-backlog") })
  await page.unroute("**/*")
  await ctx.close()
})

test("axe: serious/critical violations on key pages", async ({ browser }) => {
  const ctx = await newCtx(browser)
  const page = await ctx.newPage()
  await page.request.patch("/api/user/language", { data: { language: "ja" } })
  const pages: Array<[string, string]> = [
    ...PAGES(),
    ["sprint-board", `/projects/${PILOT}/sprints${firstSprint ? `?sprint=${firstSprint}` : ""}`],
    ["login", "/login"],
  ]
  const summary: string[] = []
  for (const [name, url] of pages) {
    if (name === "login") await ctx.clearCookies()
    await page.goto(url)
    await settle(page)
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    summary.push(`${name}: ${bad.length} serious/critical (${res.violations.length} total)`)
    for (const v of bad) {
      summary.push(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")} :: ${v.nodes[0]?.failureSummary?.replace(/\s+/g, " ").slice(0, 160)}`)
    }
  }
  fs.writeFileSync(`${DATA}/platform-axe.txt`, summary.join("\n"))
  log.push(...summary)
  await ctx.close()
})

test("keyboard: skip link, search, bell, language menu", async ({ browser }) => {
  const ctx = await newCtx(browser)
  const page = await ctx.newPage()
  await page.goto(`/projects/${PILOT}`)
  await settle(page)
  await page.keyboard.press("Tab")
  const first = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: (document.activeElement as HTMLElement)?.innerText, href: document.activeElement?.getAttribute("href") }))
  log.push(`kbd: first Tab -> ${JSON.stringify(first)}`)
  await page.screenshot({ path: shot("kbd-skip-link") })
  await page.keyboard.press("Enter")
  const afterSkip = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
  log.push(`kbd: after Enter on skip link focus -> ${afterSkip}`)

  // Walk the header with Tab and record the focus order
  await page.goto(`/projects/${PILOT}`)
  await settle(page)
  const order: string[] = []
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab")
    const d = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return "none"
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const ring = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" ? "outline" : cs.boxShadow !== "none" ? "shadow" : "NO-VISIBLE-FOCUS"
      return `${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "").trim().slice(0, 25)}]@${Math.round(r.y)} ${ring}`
    })
    order.push(d)
  }
  log.push(`kbd: header tab order: ${order.join(" → ")}`)

  // Search: Ctrl+K opens a dialog, Escape closes and returns focus
  await page.keyboard.press("Control+k")
  const dlg = page.getByRole("dialog")
  const searchOpen = await dlg.isVisible().catch(() => false)
  const searchFocus = await page.evaluate(() => document.activeElement?.tagName + ":" + (document.activeElement?.getAttribute("type") ?? ""))
  log.push(`kbd: Ctrl+K opens dialog=${searchOpen}, focus=${searchFocus}`)
  await page.screenshot({ path: shot("kbd-search") })
  await page.keyboard.press("Escape")
  log.push(`kbd: after Escape dialog visible=${await dlg.isVisible().catch(() => false)}`)

  // Bell via keyboard
  const bell = page.getByRole("button", { name: /通知|Notifications|Notifikasi/ }).first()
  await bell.focus()
  await page.keyboard.press("Enter")
  await page.waitForTimeout(800)
  const popup = await page.locator("[role=dialog], [role=menu], [role=region]").filter({ hasText: /通知|Notification|Notifikasi/ }).count()
  const bellExpanded = await bell.getAttribute("aria-expanded")
  log.push(`kbd: bell Enter -> popups=${popup} aria-expanded=${bellExpanded}; focus=${await page.evaluate(() => (document.activeElement as HTMLElement)?.innerText?.slice(0, 30))}`)
  await page.screenshot({ path: shot("kbd-bell") })
  await page.keyboard.press("Escape")
  log.push(`kbd: after Escape focus back on bell=${await bell.evaluate((el) => el === document.activeElement)}`)

  // Language select via keyboard
  const sel = page.locator("header select").first()
  await sel.focus()
  const name = await sel.evaluate((el) => (el.closest("label")?.innerText ?? "").trim())
  log.push(`kbd: language select accessible label text="${name}"`)
  await ctx.close()
})

test("responsive 375px: no horizontal scroll, drawer works", async ({ browser }) => {
  const ctx = await newCtx(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.request.patch("/api/user/language", { data: { language: "id" } })
  for (const [name, url] of PAGES()) {
    await page.goto(url)
    await settle(page)
    const m = await page.evaluate(() => {
      const w = document.documentElement.clientWidth
      const offenders: string[] = []
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = el.getBoundingClientRect()
        if (r.right > w + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
          let p: HTMLElement | null = el.parentElement
          let clipped = false
          while (p) {
            const ox = getComputedStyle(p).overflowX
            if (ox === "auto" || ox === "scroll" || ox === "hidden") { clipped = true; break }
            p = p.parentElement
          }
          if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}(${Math.round(r.right)})`)
        }
      }
      return { overflow: document.documentElement.scrollWidth - w, offenders: offenders.slice(0, 5) }
    })
    log.push(`[375] ${name}: page overflowX=${m.overflow}px ${m.offenders.length ? "offenders: " + m.offenders.join(", ") : ""}`)
    await page.screenshot({ path: shot(`m375-${name}`) })
  }
  for (const lang of ["ja", "en", "id"]) {
    await page.request.patch("/api/user/language", { data: { language: lang } })
    await page.goto(`/projects/${PILOT}/backlog`)
    await settle(page)
    const menuBtn = page.locator("header button[aria-controls]").first()
    const hit = await menuBtn.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { box: [Math.round(r.x), Math.round(r.width)], topIsButton: !!top && (top === el || el.contains(top)), top: top ? `${top.tagName.toLowerCase()}[${top.getAttribute("aria-label") ?? ""}]` : "none" }
    })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    log.push(`[375 ${lang}] header overflowX=${overflow}px; hamburger ${JSON.stringify(hit)}`)
    await page.screenshot({ path: shot(`m375-header-${lang}`), clip: { x: 0, y: 0, width: 375, height: 80 } })
    if (lang === "id") {
      const tap = await menuBtn.click({ timeout: 3000 }).then(() => "ok").catch((e: Error) => e.message.split(/\r?\n/)[0])
      log.push(`[375] tap hamburger: ${tap}`)
      if (tap !== "ok") {
        await menuBtn.focus()
        await page.keyboard.press("Enter")
      }
      await page.waitForTimeout(600)
      log.push(`[375] drawer: aria-expanded=${await menuBtn.getAttribute("aria-expanded")}`)
      await page.screenshot({ path: shot("m375-drawer-open") })
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
      log.push(`[375] drawer after Escape: aria-expanded=${await menuBtn.getAttribute("aria-expanded")}`)
    }
  }
  await ctx.close()
})

test.afterAll(async () => {
  fs.appendFileSync(`${DATA}/platform-ui.log`, log.join("\n") + "\n")
  note({ kind: "ui", log })
})

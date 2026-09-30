/**
 * Platform eval (cycle 2): P-03 / P-04 — app header at 375 / 768 / 1280 / 1440
 * for an admin and a plain member: no horizontal page scroll on the main pages
 * (incl. /portfolio), no overlap inside the header, ☰ opens the drawer by tap,
 * bell / user-menu / admin-menu popovers stay inside the viewport.
 * Read-only (no language switches: e2e-admin is ja, e2e-dev is id, e2e-sec is used for /portfolio as a member).
 */
import { test, expect, type Page } from "@playwright/test"
import * as fs from "node:fs"
import { contextFor, DATA, PILOT, shot, type Role } from "./platform-helpers"

test.describe.configure({ mode: "default" })
test.setTimeout(1_800_000)

const log: string[] = []
const problems: string[] = []
const WIDTHS = [375, 768, 1280, 1440]

const PROJECT_PAGES: Array<[string, string]> = [
  ["dashboard", `/projects/${PILOT}`],
  ["backlog", `/projects/${PILOT}/backlog`],
  ["sprints", `/projects/${PILOT}/sprints`],
  ["plan", `/projects/${PILOT}/plan`],
  ["releases", `/projects/${PILOT}/releases`],
  ["calendar", `/projects/${PILOT}/calendar`],
  ["settings", `/projects/${PILOT}/settings`],
  ["chat", `/projects/${PILOT}/chat`],
]
function pagesFor(role: Role): Array<[string, string]> {
  const top: Array<[string, string]> = [["home", "/"], ["me", "/me"]]
  if (role === "admin") top.push(["portfolio", "/portfolio"], ["admin-metrics", "/admin/metrics"], ["admin-users", "/admin/users"])
  if (role === "sec") top.push(["portfolio", "/portfolio"])
  return [...top, ...PROJECT_PAGES]
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(400)
}

/** Page overflow + header geometry. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const overflow = document.documentElement.scrollWidth - vw
    const header = document.querySelector("header")
    const rect = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), r: Math.round(r.right), w: Math.round(r.width) }
    }
    const start = header?.querySelector("[data-header-start]") ?? null
    const end = header?.querySelector("[data-header-end]") ?? null
    const logo = header?.querySelector("a[href='/']") ?? null
    // Every visible interactive element of the header must be the topmost element at its centre.
    const covered: string[] = []
    const offscreen: string[] = []
    for (const el of Array.from(header?.querySelectorAll<HTMLElement>("a, button, select") ?? [])) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue
      const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 20)
      if (r.x < -1 || r.right > vw + 1) offscreen.push(`${name}(${Math.round(r.x)}..${Math.round(r.right)})`)
      const top = document.elementFromPoint(Math.min(Math.max(r.x + r.width / 2, 0), vw - 1), r.y + r.height / 2)
      if (top && top !== el && !el.contains(top)) covered.push(`${name}<-${top.tagName.toLowerCase()}[${(top.getAttribute("aria-label") || (top as HTMLElement).innerText || "").slice(0, 15)}]`)
    }
    const s = rect(start), e = rect(end), l = rect(logo)
    const breadcrumb = header?.querySelector("nav a[title]") as HTMLElement | null
    return {
      vw,
      overflow,
      start: s,
      end: e,
      logo: l,
      startEndOverlap: s && e ? Math.max(0, s.r - e.x) : 0,
      logoEndOverlap: l && e ? Math.max(0, l.r - e.x) : 0,
      breadcrumbWidth: breadcrumb ? Math.round(breadcrumb.getBoundingClientRect().width) : null,
      covered,
      offscreen,
    }
  })
}

async function popoverInViewport(page: Page, button: ReturnType<Page["locator"]>, label: string, key: string): Promise<void> {
  if (!(await button.isVisible().catch(() => false))) {
    log.push(`    ${label}: button not visible`)
    return
  }
  await button.click()
  await page.waitForTimeout(600)
  const controls = await button.getAttribute("aria-controls")
  const expanded = await button.getAttribute("aria-expanded")
  const panel = controls ? page.locator(`[id="${controls}"]`) : page.locator("[role=dialog],[role=menu]").last()
  const box = await panel.boundingBox().catch(() => null)
  const vw = page.viewportSize()?.width ?? 0
  const vh = page.viewportSize()?.height ?? 0
  const inside = !!box && box.x >= -1 && box.x + box.width <= vw + 1 && box.y >= -1
  log.push(`    ${label}: expanded=${expanded} panel=${box ? `${Math.round(box.x)}..${Math.round(box.x + box.width)} y=${Math.round(box.y)} h=${Math.round(box.height)}` : "none"} inViewport=${inside} (vh ${vh})`)
  if (!inside) problems.push(`${key} ${label} popover outside viewport ${JSON.stringify(box)}`)
  await page.screenshot({ path: shot(`hdr-${key}-${label}`) })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
}

for (const role of ["admin", "dev", "sec"] as Role[]) {
  test(`header + overflow at ${WIDTHS.join("/")} as ${role}`, async ({ browser }) => {
    const before = problems.length
    for (const width of WIDTHS) {
      const mobile = width < 768
      const ctx = await contextFor(browser, role, { viewport: { width, height: mobile ? 812 : 900 }, isMobile: mobile, hasTouch: mobile })
      const page = await ctx.newPage()
      for (const [name, url] of pagesFor(role)) {
        await page.goto(url)
        await settle(page)
        const m = await measure(page)
        const key = `${role}-${width}-${name}`
        const bad = m.overflow > 0 || m.startEndOverlap > 0 || m.logoEndOverlap > 0 || m.covered.length || m.offscreen.length
        log.push(`[${key}] overflowX=${m.overflow} start=${JSON.stringify(m.start)} end=${JSON.stringify(m.end)} logoOverlap=${m.logoEndOverlap} startEndOverlap=${m.startEndOverlap} crumbW=${m.breadcrumbWidth} covered=${m.covered.join(";") || "-"} offscreen=${m.offscreen.join(";") || "-"}`)
        if (bad) problems.push(`${key}: overflow=${m.overflow} overlap=${m.startEndOverlap}/${m.logoEndOverlap} covered=${m.covered.join(";")} offscreen=${m.offscreen.join(";")}`)
        if (name === "dashboard" || name === "portfolio" || name === "backlog" || m.overflow > 0) await page.screenshot({ path: shot(`hdr-${key}`) })
      }

      // Popovers + drawer on the dashboard
      await page.goto(`/projects/${PILOT}`)
      await settle(page)
      const key = `${role}-${width}`
      const hamburger = page.locator("header [data-header-start] button[aria-controls]").first()
      if (width < 1024) {
        const tap = mobile
          ? await hamburger.tap({ timeout: 3000 }).then(() => "ok").catch((e: Error) => e.message.split(/\r?\n/)[0])
          : await hamburger.click({ timeout: 3000 }).then(() => "ok").catch((e: Error) => e.message.split(/\r?\n/)[0])
        await page.waitForTimeout(500)
        const expanded = await hamburger.getAttribute("aria-expanded")
        log.push(`  [${key}] ☰ ${mobile ? "tap" : "click"}: ${tap} aria-expanded=${expanded}`)
        if (tap !== "ok" || expanded !== "true") problems.push(`${key} hamburger: ${tap} expanded=${expanded}`)
        await page.screenshot({ path: shot(`hdr-${key}-drawer`) })
        await page.keyboard.press("Escape")
        await page.waitForTimeout(400)
        log.push(`  [${key}] ☰ after Escape aria-expanded=${await hamburger.getAttribute("aria-expanded")}`)
      } else {
        log.push(`  [${key}] ☰ visible=${await hamburger.isVisible().catch(() => false)} (sidebar inline)`)
      }
      await popoverInViewport(page, page.getByRole("button", { name: /^(通知|Notifications|Notifikasi)/ }).first(), "bell", key)
      await popoverInViewport(page, page.locator("header [data-header-end] button[aria-expanded]").last(), "usermenu", key)
      if (role === "admin" && width >= 1024) await popoverInViewport(page, page.getByRole("button", { name: /^(管理|Admin)/ }).first(), "adminmenu", key)
      await ctx.close()
    }
    expect.soft(problems.slice(before), problems.slice(before).join("\n")).toEqual([])
  })
}

test.afterAll(() => {
  fs.appendFileSync(`${DATA}/c2-responsive.log`, log.join("\n") + "\n\nPROBLEMS:\n" + problems.join("\n") + "\n")
  expect.soft(problems, problems.join("\n")).toEqual([])
})

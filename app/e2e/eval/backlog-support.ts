import { expect, type Page, type BrowserContext, type Browser } from "@playwright/test"
import { loginViaUi } from "../support/login"

export const PASSWORD = "E2e-Kanflow-2026!"
export const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
export const BACKLOG = `/projects/${PROJECT}/backlog`
export const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
export const USERS = {
  admin: "e2e-admin@example.test",
  po: "e2e-po@example.test",
  sm: "e2e-sm@example.test",
  dev: "e2e-dev@example.test",
  sec: "e2e-sec@example.test",
} as const
export type Role = keyof typeof USERS

export interface Issues { console: string[]; failed: string[] }

/** Collect console errors + failed requests (>=400 or network failure). */
export function watch(page: Page): Issues {
  const issues: Issues = { console: [], failed: [] }
  page.on("console", (m) => { if (m.type() === "error") issues.console.push(`${page.url()} :: ${m.text().slice(0, 300)}`) })
  page.on("pageerror", (e) => issues.console.push(`${page.url()} :: pageerror ${e.message.slice(0, 300)}`))
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? ""
    if (/ERR_ABORTED/.test(f)) return
    issues.failed.push(`${r.method()} ${r.url()} :: ${f}`)
  })
  page.on("response", (r) => { if (r.status() >= 400) issues.failed.push(`${r.request().method()} ${r.url()} :: ${r.status()}`) })
  return issues
}

export async function login(page: Page, role: Role) {
  // Cycle 2: the login page now starts in the last-used / Accept-Language
  // language (F-12 fix); pin the anonymous language to ja for the JA selectors.
  const base = process.env.E2E_BASE_URL || "http://localhost:3104"
  await page.context().addCookies([{ name: "kanflow_lang", value: "ja", url: base }])
  await loginViaUi(page, USERS[role], PASSWORD)
}

export async function newUserPage(browser: Browser, role: Role): Promise<{ ctx: BrowserContext; page: Page; issues: Issues }> {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true })
  const page = await ctx.newPage()
  const issues = watch(page)
  await login(page, role)
  return { ctx, page, issues }
}

export async function gotoBacklog(page: Page, query = "") {
  await page.goto(`${BACKLOG}${query}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.locator("[data-dnd-row]").first()).toBeVisible({ timeout: 30_000 })
}

export function report(name: string, issues: Issues) {
  const uniq = (a: string[]) => [...new Set(a)]
  console.log(`\n=== ISSUES ${name} ===\nconsole:\n${uniq(issues.console).join("\n")}\nfailed:\n${uniq(issues.failed).join("\n")}\n`)
}

type Json = Record<string, unknown>
/** API call with the page's session cookies. */
export async function api(page: Page, method: string, url: string, data?: unknown): Promise<{ status: number; body: Json }> {
  const res = await page.request.fetch(url, { method, data: data as Json | undefined, headers: { "content-type": "application/json", origin: new URL(page.url()).origin } })
  let body: Json = {}
  try { body = await res.json() } catch { /* not json */ }
  return { status: res.status(), body }
}

export const stamp = () => new Date().toISOString().replace(/[-:T.Z]/g, "").slice(4, 14)

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"
import { LOGIN_TEXT, type LoginLanguage } from "../support/login"

export const PASSWORD = "E2e-Kanflow-2026!"
export const IOT = "cmr8tnrzm0000m09lghm5jshr"
export const IOT_ACTIVE_SPRINT = "cmtb4vbdm006avk9lucrwszia"
export const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
export const STATE_FILE = path.join(__dirname, ".sprints-state.json")
export const USERS = {
  admin: { email: "e2e-admin@example.test", id: "e2eadmin0000000000000001" },
  po: { email: "e2e-po@example.test", id: "e2epo00000000000000000002" },
  sm: { email: "e2e-sm@example.test", id: "e2esm00000000000000000003" },
  dev: { email: "e2e-dev@example.test", id: "e2edev0000000000000000004" },
} as const
export type Role = keyof typeof USERS

export interface SprintsState {
  projectId: string
  projectName: string
  pbiIds: string[]
  sprintId?: string
  taskIds?: string[]
}

export function readState(): SprintsState {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as SprintsState
}
export function writeState(s: SprintsState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}
export function hasState(): boolean {
  return fs.existsSync(STATE_FILE)
}

export interface Issues { console: string[]; failed: string[] }

export function watch(page: Page): Issues {
  const issues: Issues = { console: [], failed: [] }
  page.on("console", (m) => { if (m.type() === "error") issues.console.push(`${short(page.url())} :: ${m.text().slice(0, 300)}`) })
  page.on("pageerror", (e) => issues.console.push(`${short(page.url())} :: pageerror ${e.message.slice(0, 300)}`))
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? ""
    if (/ERR_ABORTED/.test(f)) return
    issues.failed.push(`${r.method()} ${short(r.url())} :: ${f}`)
  })
  page.on("response", (r) => { if (r.status() >= 400) issues.failed.push(`${r.request().method()} ${short(r.url())} :: ${r.status()}`) })
  return issues
}
const short = (u: string) => u.replace(/^https?:\/\/[^/]+/, "")

export function report(name: string, issues: Issues) {
  const uniq = (a: string[]) => [...new Set(a)]
  console.log(`\n=== ISSUES ${name} ===\nconsole:\n${uniq(issues.console).join("\n") || "(none)"}\nfailed:\n${uniq(issues.failed).join("\n") || "(none)"}\n`)
}

export async function newUserPage(browser: Browser, role: Role, opts: Parameters<Browser["newContext"]>[0] = {}):
  Promise<{ ctx: BrowserContext; page: Page; issues: Issues }> {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  const issues = watch(page)
  await loginAs(page, role)
  return { ctx, page, issues }
}

/** Default UI language per test account (e2e-dev is the Indonesian user). */
export const LANG: Record<Role, LoginLanguage> = { admin: "ja", po: "ja", sm: "ja", dev: "id" }

/**
 * Login through the form with the account's language explicitly selected (cycle 2:
 * the login page starts from the kanflow_lang cookie / Accept-Language and only
 * saves the language when a pill is clicked). Pass `lang: null` to log in
 * without touching the pills (the page's resolved language is detected).
 */
export async function loginAs(page: Page, role: Role, lang: LoginLanguage | null = LANG[role]) {
  await page.goto("/login")
  if (lang) await page.getByRole("button", { name: new RegExp(`^${lang.toUpperCase()}`) }).click()
  else lang = (await page.locator("html").getAttribute("lang")) as LoginLanguage
  const t = LOGIN_TEXT[lang]
  await page.getByLabel(t.email).fill(USERS[role].email)
  await page.getByLabel(t.password).fill(PASSWORD)
  await page.getByRole("button", { name: t.button, exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 })
}

type Json = Record<string, unknown>
export async function api<T = Json>(page: Page, method: string, url: string, data?: unknown): Promise<{ status: number; body: T }> {
  const origin = new URL(page.url()).origin
  const res = await page.request.fetch(url, { method, data: data as Json | undefined, headers: { "content-type": "application/json", origin } })
  let body = {} as T
  try { body = (await res.json()) as T } catch { /* not json */ }
  return { status: res.status(), body }
}

export const stamp = () => new Date().toISOString().replace(/[-:T.Z]/g, "").slice(4, 12)

export function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/** Visible text nodes containing Japanese kana/kanji (untranslated UI for an `id` user). */
export async function japaneseStrings(page: Page, root = "main"): Promise<string[]> {
  return page.evaluate((sel) => {
    const out = new Set<string>()
    const base = document.querySelector(sel) ?? document.body
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT)
    const re = /[\u3040-\u30ff\u3400-\u9fff]/
    let n: Node | null
    while ((n = walker.nextNode())) {
      const txt = (n.textContent ?? "").trim()
      if (!txt || !re.test(txt)) continue
      const el = n.parentElement
      if (!el) continue
      const st = getComputedStyle(el)
      if (st.display === "none" || st.visibility === "hidden") continue
      out.add(txt.slice(0, 80))
    }
    // attributes that screen readers read
    base.querySelectorAll("[aria-label],[title],[placeholder]").forEach((el) => {
      for (const a of ["aria-label", "title", "placeholder"]) {
        const v = el.getAttribute(a)
        if (v && re.test(v)) out.add(`@${a}=${v.slice(0, 80)}`)
      }
    })
    return [...out]
  }, root)
}

export async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: `${SHOTS}/sprints-${name}.png`, fullPage })
}

export async function gotoSprints(page: Page, projectId: string, query = "") {
  await page.goto(`/projects/${projectId}/sprints${query}`)
  await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 })
}

/** Latest live-region announcement text. */
export async function liveText(page: Page): Promise<string> {
  return page.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent ?? "").join(" | "))
}

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"

export const BASE = process.env.E2E_BASE_URL || "http://localhost:3102"
export const PASSWORD = "E2e-Kanflow-2026!"
export const PILOT = "cmr8tnrzm0000m09lghm5jshr"
export const ZEVA = "cmouvgryo0004eg9lpqdtctmq"
export const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
export const OUT = "D:/APP/Kanflow-e2e/reports/accept-data"
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

export const USERS = {
  admin: "e2e-admin@example.test",
  po: "e2e-po@example.test",
  sm: "e2e-sm@example.test",
  dev: "e2e-dev@example.test",
  sec: "e2e-sec@example.test",
} as const
export type Role = keyof typeof USERS

export interface Session { ctx: BrowserContext; page: Page; role: Role; log: (s: string) => void; errs: string[] }

const LOGIN_LABELS: Record<string, { email: string; password: string; button: string }> = {
  ja: { email: "メールアドレス", password: "パスワード", button: "ログイン" },
  id: { email: "Alamat Email", password: "Kata Sandi", button: "Masuk" },
  en: { email: "Email Address", password: "Password", button: "Login" },
}

/** Log a line to the per-persona log file and stdout. */
function logger(file: string) {
  const p = path.join(OUT, file)
  return (s: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`
    fs.appendFileSync(p, line + "\n")
    console.log(line)
  }
}

export async function open(browser: Browser, role: Role, opts: { width?: number; height?: number; lang?: "ja" | "id" | "en"; logFile: string; locale?: string }): Promise<Session> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    locale: opts.locale ?? "ja-JP",
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const lang = opts.lang ?? "ja"
  await ctx.addCookies([{ name: "kanflow_lang", value: lang, url: BASE }])
  const page = await ctx.newPage()
  const log = logger(opts.logFile)
  const errs: string[] = []
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console ${page.url()} :: ${m.text().slice(0, 240)}`) })
  page.on("pageerror", (e) => errs.push(`pageerror ${page.url()} :: ${e.message.slice(0, 240)}`))
  page.on("response", (r) => { if (r.status() >= 400 && !/_next\/static/.test(r.url())) errs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`) })
  const t = LOGIN_LABELS[lang]
  const t0 = Date.now()
  await page.goto("/login")
  await page.getByLabel(t.email).fill(USERS[role])
  await page.getByLabel(t.password).fill(PASSWORD)
  await page.getByRole("button", { name: t.button, exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 })
  await page.waitForLoadState("networkidle").catch(() => {})
  log(`login ${role} -> ${page.url()} in ${Date.now() - t0} ms`)
  return { ctx, page, role, log, errs }
}

/** Navigate and time until network idle (approximation of "page usable"). */
export async function visit(s: Session, url: string, label: string): Promise<number> {
  const t0 = Date.now()
  await s.page.goto(url)
  await s.page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {})
  const ms = Date.now() - t0
  s.log(`VISIT ${label} ${url} ${ms} ms`)
  return ms
}

export async function snap(s: Session, name: string, fullPage = false): Promise<string> {
  const f = `${SHOTS}/acc3-${name}.png`
  await s.page.screenshot({ path: f, fullPage })
  s.log(`SHOT ${f}`)
  return f
}

/** Dump the ARIA snapshot of the main area for later textual review. */
export async function dump(s: Session, name: string): Promise<void> {
  const aria = await s.page.locator("body").ariaSnapshot().catch((e) => `ERR ${e}`)
  fs.writeFileSync(path.join(OUT, `${name}.aria.txt`), aria)
}

/** Horizontal overflow in px (document scrollWidth - viewport width). */
export async function overflow(s: Session): Promise<number> {
  return s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

/** Visible text nodes matching a regex (for untranslated-string checks). */
export async function textMatches(s: Session, re: RegExp): Promise<string[]> {
  const src = re.source
  const flags = re.flags
  return s.page.evaluate(({ src, flags }) => {
    const r = new RegExp(src, flags)
    const out = new Set<string>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const el = n.parentElement
      if (!el) continue
      const cs = getComputedStyle(el)
      if (cs.display === "none" || cs.visibility === "hidden") continue
      if (el.closest("script,style,[aria-hidden=true]")) continue
      const t = (n.textContent || "").trim()
      if (t && r.test(t)) out.add(t.slice(0, 80))
    }
    const attrs = document.querySelectorAll("[placeholder],[title],[aria-label]")
    attrs.forEach((a) => {
      for (const k of ["placeholder", "title", "aria-label"]) {
        const v = a.getAttribute(k)
        if (v && r.test(v)) out.add(`@${k}=${v.slice(0, 80)}`)
      }
    })
    return [...out]
  }, { src, flags })
}

export function flushErrs(s: Session, label: string) {
  const uniq = [...new Set(s.errs)]
  s.log(`ERRORS@${label}: ${uniq.length ? "\n  " + uniq.join("\n  ") : "none"}`)
  s.errs.length = 0
}

export const stamp = () => new Date().toISOString().replace(/[-:T.Z]/g, "").slice(4, 12)

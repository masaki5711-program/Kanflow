import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import { BASE, PASSWORD, PILOT, ZEVA, USERS, contextFor } from "./platform-helpers"

/**
 * Regression cycle 6 — read-only checks for the Next 16.1.6 -> 16.3.7 upgrade,
 * aimed at the framework surfaces the app leans on: proxy (CSP nonce), server
 * redirect() to /login, not-found rendering, App Router client navigation +
 * history (back/forward, URL state) and hydration on pages the c5 sweep does
 * not visit (login, 404). No writes, no AI calls.
 */
test.describe.configure({ mode: "default" })
test.setTimeout(120_000)

const OUT = process.env.E2E_C6_OUT ?? "D:/APP/Kanflow-e2e/reports/c6-logs/next163-checks.jsonl"
const P = `/projects/${PILOT}`

interface Watch { console: string[]; pageErrors: string[]; h5xx: string[]; csp: string[] }
function watch(page: Page): Watch {
  const w: Watch = { console: [], pageErrors: [], h5xx: [], csp: [] }
  page.on("console", (m) => {
    if (m.type() !== "error") return
    w.console.push(m.text().slice(0, 300))
    if (/Content Security Policy|CSP/i.test(m.text())) w.csp.push(m.text().slice(0, 300))
  })
  page.on("pageerror", (e) => w.pageErrors.push(e.message.slice(0, 300)))
  page.on("response", (r) => { if (r.status() >= 500) w.h5xx.push(`${r.status()} ${r.url()}`) })
  return w
}
function log(name: string, data: Record<string, unknown>) {
  fs.appendFileSync(OUT, JSON.stringify({ t: new Date().toISOString(), name, ...data }) + "\n")
  console.log(name, JSON.stringify(data))
}
/** Console errors that are expected in these flows (the 404 document itself is reported by Chromium as a failed resource). */
const benign = (s: string) => /Failed to load resource: the server responded with a status of 404/.test(s)

test("anonymous deep links and server redirect() land on /login; login then works", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE, locale: "ja-JP" })
  await ctx.addCookies([{ name: "kanflow_lang", value: "ja", url: BASE }])
  const page = await ctx.newPage()
  const w = watch(page)
  const landed: Record<string, string> = {}
  // proxy/route-level 307 (project deep link with ?pbi&tab) and in-stream redirect() (admin, me, home)
  for (const u of [`${P}/backlog?pbi=340&tab=comments`, `${P}/plan?zoom=week`, "/admin/users", "/me", "/"]) {
    await page.goto(u)
    await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 })
    landed[u] = new URL(page.url()).pathname
  }
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible()
  await page.getByLabel("メールアドレス").fill(USERS.po)
  await page.getByLabel("パスワード").fill(PASSWORD)
  await page.getByRole("button", { name: "ログイン", exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 })
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  log("anon-redirects", { landed, after: new URL(page.url()).pathname, ...w })
  await ctx.close()
  expect(Object.values(landed).every((p) => p === "/login")).toBe(true)
  expect(w.pageErrors, "page errors").toEqual([])
  expect(w.console.filter((s) => !benign(s)), "console errors").toEqual([])
  expect(w.h5xx).toEqual([])
})

test("not-found: unknown route and a project outside the user's scope render the 404 page", async ({ browser }) => {
  const ctx = await contextFor(browser, "sm", { locale: "ja-JP" })
  const page = await ctx.newPage()
  const w = watch(page)
  const out: Record<string, number | null> = {}
  for (const u of ["/no-such-page-c6", `/projects/${ZEVA}`, `/projects/${ZEVA}/backlog`, `/projects/doesnotexist000000000000/plan`]) {
    const res = await page.goto(u)
    out[u] = res?.status() ?? null
    await expect(page.getByText(/ページが見つかりません|404/).first()).toBeVisible()
  }
  // and the app still navigates normally from the 404 page
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  log("not-found", { statuses: out, ...w })
  await ctx.close()
  expect(Object.values(out).every((s) => s === 404)).toBe(true)
  expect(w.pageErrors).toEqual([])
  expect(w.console.filter((s) => !benign(s))).toEqual([])
  expect(w.h5xx).toEqual([])
})

test("proxy CSP nonce is stamped on every script; no CSP violations", async ({ browser }) => {
  const ctx = await contextFor(browser, "po", { locale: "ja-JP" })
  const page = await ctx.newPage()
  const w = watch(page)
  const rows: Record<string, unknown>[] = []
  for (const u of ["/", `${P}/backlog`, `${P}/plan`, "/login"]) {
    const res = await page.goto(u, { waitUntil: "load" })
    const csp = (await res?.headerValue("content-security-policy")) ?? ""
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? ""
    const scripts = await page.evaluate(() => [...document.querySelectorAll("script")].map((s) => ({ src: s.getAttribute("src") ?? "(inline)", nonce: (s as HTMLScriptElement).nonce })))
    const missing = scripts.filter((s) => s.nonce !== nonce).map((s) => s.src)
    rows.push({ u, status: res?.status(), hasCsp: !!csp, scripts: scripts.length, missing })
  }
  log("csp-nonce", { rows, csp: w.csp, console: w.console })
  await ctx.close()
  for (const r of rows) {
    expect(r.hasCsp, `${r.u} CSP header`).toBe(true)
    expect(r.missing, `${r.u} scripts without the request nonce`).toEqual([])
  }
  expect(w.csp).toEqual([])
  expect(w.pageErrors).toEqual([])
})

test("client-side navigation + browser back/forward across project pages", async ({ browser }) => {
  const ctx = await contextFor(browser, "po", { locale: "ja-JP" })
  const page = await ctx.newPage()
  const w = watch(page)
  await page.goto(P)
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  const h1 = () => page.getByRole("heading", { level: 1 }).first().innerText()
  const trail: string[] = [await h1()]
  let docLoads = 0
  page.on("load", () => docLoads++)
  for (const seg of ["backlog", "plan", "sprints"]) {
    await page.locator(`a[href="${P}/${seg}"]`).first().click()
    await page.waitForURL(new RegExp(`${P}/${seg}(\\?|$)`))
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
    trail.push(await h1())
  }
  const back: string[] = []
  for (const seg of ["plan", "backlog", ""]) {
    await page.goBack()
    await page.waitForURL(new RegExp(`${P}${seg ? "/" + seg : ""}(\\?|$)`))
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
    back.push(await h1())
  }
  await page.goForward()
  await page.waitForURL(new RegExp(`${P}/backlog(\\?|$)`))
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  const fwd = await h1()
  log("client-nav", { trail, back, fwd, docLoads, ...w })
  await ctx.close()
  expect(back).toEqual([trail[2], trail[1], trail[0]])
  expect(fwd).toBe(trail[1])
  expect(docLoads, "soft navigations must not reload the document").toBe(0)
  expect(w.pageErrors).toEqual([])
  expect(w.console).toEqual([])
  expect(w.h5xx).toEqual([])
})

test("URL state: backlog filter (replaceState) + ?pbi (pushState) interplay with back/forward and reload", async ({ browser }) => {
  // Contract (use-backlog-url-state.ts): filters REPLACE the current entry, opening a PBI PUSHES one.
  const ctx = await contextFor(browser, "po", { locale: "ja-JP" })
  const page = await ctx.newPage()
  const w = watch(page)
  await page.goto(P)
  await page.locator(`a[href="${P}/backlog"]`).first().click()
  await page.waitForURL(new RegExp(`${P}/backlog(\\?|$)`))
  const status = page.getByRole("combobox", { name: "状態" })
  await expect(status).toBeVisible()
  await status.selectOption({ label: "着手可能" })
  await expect(page).toHaveURL(/status=ready/)
  const selected = await status.inputValue()
  // open a PBI (push) -> Back closes it and keeps the filter
  const title = (await page.locator("[data-dnd-row]").first().getByRole("heading").first().innerText()).trim()
  await page.getByRole("button", { name: title }).first().click()
  await expect(page).toHaveURL(/[?&]pbi=/)
  await expect(page.getByRole("dialog").first()).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]pbi=/)
  await expect(page).toHaveURL(/status=ready/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(status).toHaveValue(selected)
  // filter entry was replaced -> Back goes to the dashboard, Forward restores the filtered backlog
  await page.goBack()
  await page.waitForURL(new RegExp(`${P}$`))
  await page.goForward()
  await expect(page).toHaveURL(/backlog\?.*status=ready/)
  await expect(page.getByRole("combobox", { name: "状態" })).toHaveValue(selected)
  await page.reload()
  await expect(page.getByRole("combobox", { name: "状態" })).toHaveValue(selected)
  log("url-state", { selected, url: page.url(), ...w })
  await ctx.close()
  expect(w.pageErrors).toEqual([])
  expect(w.console).toEqual([])
})

test("hydration: login and 404 pages load without React errors (x2)", async ({ browser }) => {
  const res: Record<string, unknown>[] = []
  for (let i = 0; i < 2; i++) {
    const anon = await browser.newContext({ baseURL: BASE })
    const a = await anon.newPage(); const wa = watch(a)
    await a.goto("/login", { waitUntil: "networkidle" })
    res.push({ page: "/login", ...wa })
    await anon.close()
    const ctx = await contextFor(browser, "dev")
    const p = await ctx.newPage(); const wp = watch(p)
    await p.goto("/no-such-page-c6", { waitUntil: "networkidle" })
    res.push({ page: "404 (dev, id)", ...wp })
    await ctx.close()
  }
  log("hydration-extra", { res })
  for (const r of res as unknown as Watch[]) {
    expect(r.pageErrors).toEqual([])
    expect(r.console.filter((s) => !benign(s))).toEqual([])
  }
})

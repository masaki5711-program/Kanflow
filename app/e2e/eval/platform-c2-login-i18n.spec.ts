/**
 * Platform eval (cycle 2): login flow in ja / en / id — last-language cookie,
 * Accept-Language fallback, profile language not overwritten unless changed on
 * the login page, logout returns to the login page in the last language.
 * Uses a throwaway member (deactivated at the end).
 */
import { test, expect, request as pwRequest, type Browser, type Page } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, apiLogin, BASE, DATA, PASSWORD, PILOT, shot } from "./platform-helpers"

test.describe.configure({ mode: "serial" })
test.setTimeout(300_000)

const log: string[] = []
let email = ""
let userId = ""

const LOGIN_H2: Record<string, RegExp> = { ja: /ログイン/, en: /Sign in|Log in|Login/i, id: /Masuk/i }

async function loginPage(browser: Browser, opts: { acceptLanguage?: string; cookie?: string }): Promise<Page> {
  // Chromium derives the navigation Accept-Language from the context locale.
  const ctx = await browser.newContext({ baseURL: BASE, locale: opts.acceptLanguage })
  if (opts.cookie) await ctx.addCookies([{ name: "kanflow_lang", value: opts.cookie, url: BASE }])
  const page = await ctx.newPage()
  await page.goto("/login")
  await page.waitForLoadState("networkidle").catch(() => {})
  return page
}

async function describeLogin(page: Page) {
  return {
    htmlLang: await page.locator("html").getAttribute("lang"),
    h2: (await page.locator("h2").first().textContent())?.trim(),
    pressed: await page.locator("button[aria-pressed=true]").first().getAttribute("lang"),
    title: await page.title(),
  }
}

async function cookieLang(page: Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((c) => c.name === "kanflow_lang")?.value
}

async function submit(page: Page, password = PASSWORD) {
  await page.locator("input[type=email]").fill(email)
  await page.locator("input[type=password]").fill(password)
  await page.locator("form button[type=submit]").click()
}

test.beforeAll(async () => {
  const admin = await apiFor("admin")
  email = `plat-c2-lang-${Date.now()}@example.test`
  const r = await admin.post("/api/users", { data: { name: "Plat Lang", email, password: PASSWORD, role: "member" } })
  expect(r.status()).toBe(201)
  userId = (await r.json()).id
  await admin.post(`/api/projects/${PILOT}/members`, { data: { userId, role: "dev" } })
  const me = await apiLogin(email)
  expect((await me.patch("/api/user/language", { data: { language: "id" } })).status()).toBe(200)
  fs.writeFileSync(`${DATA}/c2-login-user.txt`, `${email} ${userId}\n`)
})

test("login page language: Accept-Language, cookie, invalid cookie", async ({ browser }) => {
  const cases: Array<[string, { acceptLanguage?: string; cookie?: string }, string]> = [
    ["browser ja-JP", { acceptLanguage: "ja-JP" }, "ja"],
    ["browser id-ID", { acceptLanguage: "id-ID" }, "id"],
    ["browser en-US", { acceptLanguage: "en-US" }, "en"],
    ["browser fr-FR (unsupported)", { acceptLanguage: "fr-FR" }, "ja"],
    ["cookie en beats browser id-ID", { acceptLanguage: "id-ID", cookie: "en" }, "en"],
    ["invalid cookie xx -> browser id-ID", { acceptLanguage: "id-ID", cookie: "xx" }, "id"],
  ]
  // Exact Accept-Language headers (q-values) through the HTTP client
  const raw = await pwRequest.newContext({ baseURL: BASE })
  for (const [al, want] of [["", "ja"], ["fr-FR,fr;q=0.9,en;q=0.5", "en"], ["en;q=0.2,id;q=0.8", "id"], ["*", "ja"]] as const) {
    const html = await (await raw.get("/login", { headers: al ? { "Accept-Language": al } : {} })).text()
    const lang = html.match(/<html[^>]*lang="([a-z]+)"/)?.[1]
    log.push(`[login-page http] Accept-Language "${al}" -> html lang=${lang}`)
    expect.soft(lang, al).toBe(want)
  }
  for (const [name, opts, want] of cases) {
    const page = await loginPage(browser, opts)
    const d = await describeLogin(page)
    log.push(`[login-page] ${name}: ${JSON.stringify(d)}`)
    expect.soft(d.htmlLang, name).toBe(want)
    expect.soft(d.pressed, name).toBe(want)
    expect.soft(d.h2 ?? "", name).toMatch(LOGIN_H2[want])
    await page.screenshot({ path: shot(`login-${want}-${name.replace(/[^a-z0-9]+/gi, "_")}`) })
    await page.context().close()
  }
})

test("untouched selector keeps the profile language; explicit choice saves it; logout keeps it", async ({ browser }) => {
  // 1. Browser in ja, user saved language id, selector untouched
  let page = await loginPage(browser, { acceptLanguage: "ja-JP" })
  await submit(page)
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 })
  await page.waitForLoadState("networkidle").catch(() => {})
  let saved = await (await page.request.get("/api/user/language")).json()
  log.push(`[flow] untouched ja login -> saved=${JSON.stringify(saved)} html=${await page.locator("html").getAttribute("lang")} cookie=${await cookieLang(page)}`)
  expect.soft(JSON.stringify(saved)).toContain('"id"')
  expect.soft(await page.locator("html").getAttribute("lang")).toBe("id")
  expect.soft(await cookieLang(page)).toBe("id")
  await page.screenshot({ path: shot("login-flow-untouched-home") })
  await page.context().close()

  // 2. Explicitly choose EN on the login page
  page = await loginPage(browser, { acceptLanguage: "ja-JP" })
  await page.locator("button[lang=en]").click()
  const afterClick = await describeLogin(page)
  log.push(`[flow] clicked EN on login page: ${JSON.stringify(afterClick)} cookie=${await cookieLang(page)}`)
  // wrong password first: error in the chosen language
  await submit(page, "wrong-password-123")
  const err = (await page.locator("[role=alert]").first().textContent({ timeout: 15_000 }).catch(() => ""))?.trim()
  log.push(`[flow] wrong password error (en): "${err}"`)
  expect.soft(err ?? "").not.toMatch(/[぀-ヿ一-龯]/)
  await submit(page)
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 })
  await page.waitForLoadState("networkidle").catch(() => {})
  saved = await (await page.request.get("/api/user/language")).json()
  log.push(`[flow] explicit EN login -> saved=${JSON.stringify(saved)} html=${await page.locator("html").getAttribute("lang")} cookie=${await cookieLang(page)}`)
  expect.soft(JSON.stringify(saved)).toContain('"en"')

  // 3. Logout via the user menu -> login page in en
  await page.locator("header [data-header-end] button[aria-expanded]").last().click()
  await page.getByRole("button", { name: /Log ?out|Sign out|ログアウト|Keluar/i }).click({ timeout: 15_000 })
  await page.waitForURL(/\/login/, { timeout: 30_000 })
  await page.waitForLoadState("networkidle").catch(() => {})
  const out = await describeLogin(page)
  log.push(`[flow] after logout: ${JSON.stringify(out)} cookie=${await cookieLang(page)}`)
  expect.soft(out.htmlLang).toBe("en")
  await page.screenshot({ path: shot("login-after-logout-en") })

  // 4. Switch language in the app (header / me) -> cookie follows, next login page follows
  await submit(page)
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 })
  await page.request.patch("/api/user/language", { data: { language: "ja" } })
  await page.goto("/me")
  await page.waitForLoadState("networkidle").catch(() => {})
  log.push(`[flow] after PATCH language ja + /me: html=${await page.locator("html").getAttribute("lang")} cookie=${await cookieLang(page)}`)
  await page.context().close()
})

test.afterAll(async () => {
  const admin = await apiFor("admin")
  if (userId) {
    const members = await (await admin.get(`/api/projects/${PILOT}/members`)).json()
    const list = (Array.isArray(members) ? members : members.members ?? members.items ?? []) as Array<{ id: string; userId?: string; user?: { id: string } }>
    const m = list.find((x) => x.userId === userId || x.user?.id === userId)
    log.push(`cleanup: remove member -> ${m ? (await admin.delete(`/api/projects/${PILOT}/members/${m.id}`)).status() : "not found"}, deactivate -> ${(await admin.patch(`/api/users/${userId}`, { data: { isActive: false } })).status()}`)
  }
  fs.writeFileSync(`${DATA}/c2-login-i18n.log`, log.join("\n") + "\n")
})

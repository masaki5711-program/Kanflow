/**
 * Platform eval (cycle 1): personal access tokens (/me UI + /api/v1) and admin token management.
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import { apiFor, BASE, contextFor, DATA, note, PILOT, shot, ZEVA } from "./platform-helpers"

const ZEVA_SPRINT = "cmuktxfy1002bj49liopm4zcc"
const MYSQL = "C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe"

/** Eval DB only (:3307). */
function sql(q: string): string {
  return execFileSync(MYSQL, ["-h127.0.0.1", "-P3307", "-uscrum_app", "-pkanflow_1776646447_pw", "scrum_tool", "-N", "-e", q], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
}

test.describe.configure({ mode: "serial" })
test.setTimeout(300_000)

let token = ""
let tokenName = ""
const log: string[] = []

test.beforeAll(async () => {
  // Housekeeping: revoke leftovers from earlier runs so the per-user limit (5) is not hit
  const dev = await apiFor("dev")
  const list = await (await dev.get("/api/user/api-tokens")).json()
  for (const t of list.tokens ?? []) {
    if (String(t.name).startsWith("plat-") && t.state !== "revoked") await dev.delete(`/api/user/api-tokens/${t.id}`)
  }
  await dev.dispose()
})

function bearer(t: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${t}` } })
}

test("create token on /me (shown once, copy)", async ({ browser }) => {
  const ctx = await contextFor(browser, "dev", { permissions: ["clipboard-read", "clipboard-write"] })
  const page = await ctx.newPage()
  await page.goto("/me")
  const section = page.locator("section[aria-labelledby='profile-api-tokens']")
  await expect(section).toBeVisible()
  tokenName = `plat-eval-${Date.now()}`
  await section.getByRole("textbox").first().fill(tokenName)
  await section.locator("select").first().selectOption({ index: 0 })
  await section.getByRole("button", { name: /トークンを発行|Create token|Buat token/ }).click()
  const shown = section.getByRole("textbox", { name: tokenName })
  await expect(shown).toBeVisible()
  token = await shown.inputValue()
  expect(token).toMatch(/^kfl_[A-Za-z0-9_-]{43}$/)
  await page.screenshot({ path: shot("token-shown-once"), fullPage: false })
  await section.getByRole("button", { name: /^(コピー|Copy|Salin)$/ }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "")
  log.push(`clipboard matches token: ${clip === token}`)
  await section.getByRole("button", { name: /保存しました|I have saved it|Sudah saya simpan/ }).click()
  await expect(section.getByRole("textbox", { name: tokenName })).toHaveCount(0)
  // After reload the plain token is gone; the list shows only the prefix
  await page.reload()
  await expect(section.getByText(tokenName)).toBeVisible()
  const html = await page.content()
  expect(html.includes(token)).toBe(false)
  expect(html.includes(token.slice(0, 12))).toBe(true)
  await page.screenshot({ path: shot("token-list-me"), fullPage: true })
  await ctx.close()
})

test("v1 endpoints with the token", async () => {
  expect(token).not.toBe("")
  const api = await bearer(token)
  const me = await api.get("/api/v1/me")
  expect(me.status()).toBe(200)
  const h = me.headers()
  log.push(`v1/me headers: limit=${h["x-ratelimit-limit"]} remaining=${h["x-ratelimit-remaining"]} cache=${h["cache-control"]}`)
  expect(h["x-ratelimit-limit"]).toBeTruthy()
  expect(h["x-ratelimit-remaining"]).toBeTruthy()
  expect(h["cache-control"]).toContain("no-store")
  const meBody = await me.json()
  log.push(`v1/me keys: ${Object.keys(meBody.data).join(",")}`)
  expect(Object.keys(meBody.data).sort()).toEqual(["department", "email", "id", "language", "name", "role"].sort())

  const projects = await (await api.get("/api/v1/projects")).json()
  const ids = (projects.data as Array<{ id: string }>).map((p) => p.id)
  log.push(`v1/projects: ${ids.length} projects; keys=${Object.keys(projects.data[0] ?? {}).join(",")}`)
  expect(ids).toContain(PILOT)
  expect(ids).not.toContain(ZEVA)
  const archived = await api.get("/api/v1/projects?status=archived")
  log.push(`v1/projects?status=archived -> ${archived.status()}`)
  expect((await api.get("/api/v1/projects?status=bogus")).status()).toBe(400)

  const proj = await api.get(`/api/v1/projects/${PILOT}`)
  expect(proj.status()).toBe(200)
  const pj = await proj.json()
  log.push(`v1/project keys: ${Object.keys(pj.data).join(",")}`)
  expect((await api.get(`/api/v1/projects/${ZEVA}`)).status()).toBe(404)
  expect((await api.get(`/api/v1/projects/${ZEVA}/backlog`)).status()).toBe(404)
  expect((await api.get(`/api/v1/projects/doesnotexist`)).status()).toBe(404)

  // Pagination over the backlog
  const seen = new Set<string>()
  let cursor: string | null = null
  let pages = 0
  do {
    const res = await api.get(`/api/v1/projects/${PILOT}/backlog?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    for (const row of body.data) {
      expect(seen.has(row.id)).toBe(false)
      seen.add(row.id)
    }
    if (pages === 0) log.push(`v1/backlog keys: ${Object.keys(body.data[0] ?? {}).join(",")}`)
    cursor = body.nextCursor
    pages++
  } while (cursor && pages < 20)
  const all = await (await api.get(`/api/v1/projects/${PILOT}/backlog?limit=100`)).json()
  log.push(`v1/backlog paginated: ${seen.size} rows in ${pages} pages; single page limit=100: ${all.data.length}, nextCursor=${all.nextCursor}`)
  expect(seen.size).toBe(all.data.length)
  for (const bad of ["limit=0", "limit=101", "cursor=%%%garbage", "status=bogus", "limit=abc"]) {
    const r = await api.get(`/api/v1/projects/${PILOT}/backlog?${bad}`)
    log.push(`v1/backlog?${bad} -> ${r.status()} ${(await r.text()).slice(0, 120)}`)
    expect.soft(r.status(), bad).toBe(400)
  }
  const ready = await (await api.get(`/api/v1/projects/${PILOT}/backlog?status=ready&limit=100`)).json()
  log.push(`v1/backlog?status=ready: ${ready.data.length} (statuses ${[...new Set(ready.data.map((r: { status: string }) => r.status))].join(",")})`)

  const sprints = await (await api.get(`/api/v1/projects/${PILOT}/sprints`)).json()
  log.push(`v1/sprints: ${sprints.data.length}; keys=${Object.keys(sprints.data[0] ?? {}).join(",")}`)
  const sid = sprints.data[0]?.id
  const tasks = await api.get(`/api/v1/projects/${PILOT}/sprints/${sid}/tasks`)
  expect(tasks.status()).toBe(200)
  const tj = await tasks.json()
  log.push(`v1/tasks: ${tj.data.length}; keys=${Object.keys(tj.data[0] ?? {}).join(",")}`)
  const mismatched = await api.get(`/api/v1/projects/${PILOT}/sprints/${ZEVA_SPRINT}/tasks`)
  const mm = await mismatched.json()
  log.push(`v1/tasks mismatched sprint -> ${mismatched.status()} ${JSON.stringify(mm)}`)
  expect(mismatched.status()).toBe(404)
  expect(mm.code).toBe("SPRINT_NOT_FOUND")

  for (const ep of ["plan", "releases", "activity?limit=5"]) {
    const r = await api.get(`/api/v1/projects/${PILOT}/${ep}`)
    const j = await r.json()
    log.push(`v1/${ep} -> ${r.status()} rows=${j.data?.length} nextCursor=${"nextCursor" in j ? j.nextCursor : "(absent)"} keys=${Object.keys(j.data?.[0] ?? {}).join(",")}`)
    expect(r.status()).toBe(200)
  }
  const act2 = await (await api.get(`/api/v1/projects/${PILOT}/activity?limit=5&entityType=pbi`)).json()
  log.push(`v1/activity?entityType=pbi rows=${act2.data.length}`)

  // Rate-limit counter decrements
  const r1 = Number((await api.get("/api/v1/me")).headers()["x-ratelimit-remaining"])
  const r2 = Number((await api.get("/api/v1/me")).headers()["x-ratelimit-remaining"])
  log.push(`rate remaining ${r1} -> ${r2}`)
  expect(r2).toBeLessThan(r1)

  // Token must not work on the UI API; write methods on v1 refused
  const uiApi = await api.get(`/api/projects/${PILOT}`)
  log.push(`bearer on /api/projects/:id -> ${uiApi.status()}`)
  expect(uiApi.status()).toBe(401)
  const post = await api.post(`/api/v1/projects`, { data: {} })
  log.push(`POST /api/v1/projects -> ${post.status()}`)
  expect([404, 405]).toContain(post.status())
  await api.dispose()
})

test("invalid / expired / revoked tokens -> 401", async ({ browser }) => {
  for (const bad of ["kfl_" + "A".repeat(43), "garbage", "", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")]) {
    const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: bad ? { Authorization: `Bearer ${bad}` } : {} })
    const r = await api.get("/api/v1/me")
    log.push(`bad token '${bad.slice(0, 8)}…' -> ${r.status()} www-auth=${r.headers()["www-authenticate"]} body=${await r.text()}`)
    expect(r.status()).toBe(401)
    await api.dispose()
  }
  // Session cookie + no bearer on v1
  const cookieApi = await apiFor("dev")
  expect((await cookieApi.get("/api/v1/me")).status()).toBe(401)

  // Expired: create a second token via API, back-date its expiry in the eval DB
  const created = await cookieApi.post("/api/user/api-tokens", { data: { name: `plat-exp-${Date.now()}`, expiresInDays: 30 } })
  log.push(`create 2nd token via API -> ${created.status()}`)
  expect(created.status()).toBe(201)
  const exp = await created.json()
  const expTok: string = exp.token ?? exp.data?.token
  const expId: string = exp.id ?? exp.data?.id ?? exp.apiToken?.id
  const ok = await bearer(expTok)
  expect((await ok.get("/api/v1/me")).status()).toBe(200)
  sql(`UPDATE ApiToken SET expiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE WHERE prefix = '${expTok.slice(0, 12)}'`)
  const r = await ok.get("/api/v1/me")
  log.push(`expired token -> ${r.status()} (id=${expId})`)
  expect(r.status()).toBe(401)

  // No-expiry request must be refused by default
  const noexp = await cookieApi.post("/api/user/api-tokens", { data: { name: "plat-noexp", expiresInDays: null } })
  log.push(`no-expiry token -> ${noexp.status()} ${(await noexp.text()).slice(0, 120)}`)
  expect(noexp.status()).toBe(400)
  const badDays = await cookieApi.post("/api/user/api-tokens", { data: { name: "plat-7d", expiresInDays: 7 } })
  log.push(`expiresInDays=7 -> ${badDays.status()}`)
  expect(badDays.status()).toBe(400)

  // Another user's token id via the user route -> 404
  const list = await (await cookieApi.get("/api/user/api-tokens")).json()
  log.push(`own token list keys: ${Object.keys(list).join(",")}; first=${JSON.stringify((list.tokens ?? list.data ?? [])[0] ?? {}).slice(0, 300)}`)
  const po = await apiFor("po")
  const mine = (list.tokens ?? []).find((t: { name: string }) => t.name === tokenName)
  const cross = await po.delete(`/api/user/api-tokens/${mine?.id}`)
  log.push(`po deletes dev's token via /api/user -> ${cross.status()}`)
  expect(cross.status()).toBe(404)

  // Revoke the UI token via /me
  const ctx = await contextFor(browser, "dev")
  const page = await ctx.newPage()
  await page.goto("/me")
  const section = page.locator("section[aria-labelledby='profile-api-tokens']")
  await section.getByRole("button", { name: new RegExp(`: ${tokenName}$`) }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^(失効|Revoke|Cabut)$/ }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: shot("token-after-revoke"), fullPage: true })
  const api = await bearer(token)
  const after = await api.get("/api/v1/me")
  log.push(`revoked (UI) token -> ${after.status()}`)
  expect(after.status()).toBe(401)
  await ctx.close()
})

test("admin /admin/api-tokens list + revoke", async ({ browser }) => {
  const dev = await apiFor("dev")
  const created = await (await dev.post("/api/user/api-tokens", { data: { name: `plat-admrev-${Date.now()}`, expiresInDays: 30 } })).json()
  const tok: string = created.token
  const name: string = created.name ?? created.token?.name
  const api = await bearer(tok)
  expect((await api.get("/api/v1/me")).status()).toBe(200)

  const ctx = await contextFor(browser, "admin")
  const page = await ctx.newPage()
  await page.goto("/admin/api-tokens")
  await expect(page.getByText(tok.slice(0, 12)).first()).toBeVisible()
  await page.screenshot({ path: shot("admin-api-tokens"), fullPage: true })
  const row = page.locator("li, tr").filter({ hasText: tok.slice(0, 12) }).first()
  await row.getByRole("button", { name: /失効|Revoke|Cabut/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^(失効|Revoke|Cabut)$/ }).click()
  await page.waitForTimeout(1500)
  const r = await api.get("/api/v1/me")
  log.push(`admin-revoked token (${name}) -> ${r.status()}`)
  expect(r.status()).toBe(401)
  await ctx.close()
})

test.afterAll(() => {
  fs.writeFileSync(`${DATA}/platform-tokens.log`, log.join("\n"))
  note({ kind: "tokens", log })
})

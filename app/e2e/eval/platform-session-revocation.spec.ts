/**
 * Platform eval (cycle 1): session revocation on deactivate / role change.
 *
 * Uses a throwaway member (added to the pilot project as dev) instead of
 * e2e-dev so that parallel evaluators' e2e-dev sessions are not killed.
 * The code path (users.service updateUser -> tokenVersion bump) is identical.
 */
import { test, expect, type APIRequestContext } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, apiLogin, BASE, DATA, note, PASSWORD, PILOT, shot } from "./platform-helpers"

test.setTimeout(300_000)

async function pollUntil401(api: APIRequestContext, path: string, maxMs = 45_000): Promise<{ ms: number; status: number }> {
  const t0 = Date.now()
  let status = 0
  while (Date.now() - t0 < maxMs) {
    status = (await api.get(path, { maxRedirects: 0 })).status()
    if (status === 401) return { ms: Date.now() - t0, status }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return { ms: Date.now() - t0, status }
}

test("deactivate / role change revokes sessions and tokens", async ({ browser }) => {
  const log: string[] = []
  const admin = await apiFor("admin")
  const email = `plat-rev-${Date.now()}@example.test`
  const created = await admin.post("/api/users", { data: { name: "Plat Revocation", email, password: PASSWORD, role: "member" } })
  expect(created.status()).toBe(201)
  const user = await created.json()
  const userId: string = user.id ?? user.data?.id
  const add = await admin.post(`/api/projects/${PILOT}/members`, { data: { userId, role: "dev" } })
  log.push(`add member -> ${add.status()}`)
  expect([200, 201]).toContain(add.status())

  try {
    // ---- deactivate
    const api = await apiLogin(email)
    expect((await api.get(`/api/projects/${PILOT}`)).status()).toBe(200)
    const tokRes = await (await api.post("/api/user/api-tokens", { data: { name: "plat-rev", expiresInDays: 30 } })).json()
    const tok: string = tokRes.token
    const bearerCtx = await (await import("@playwright/test")).request.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${tok}` } })
    expect((await bearerCtx.get("/api/v1/me")).status()).toBe(200)

    const ctx = await browser.newContext({ baseURL: BASE, storageState: await api.storageState() })
    const page = await ctx.newPage()
    await page.goto(`/projects/${PILOT}`)
    await expect(page).toHaveURL(new RegExp(`/projects/${PILOT}`))

    expect((await admin.patch(`/api/users/${userId}`, { data: { isActive: false } })).status()).toBe(200)
    const r1 = await pollUntil401(api, `/api/projects/${PILOT}`)
    log.push(`deactivate: session API -> ${r1.status} after ${r1.ms} ms`)
    expect(r1.status).toBe(401)
    const tokAfter = (await bearerCtx.get("/api/v1/me")).status()
    log.push(`deactivate: token -> ${tokAfter}`)
    expect(tokAfter).toBe(401)
    await page.goto(`/projects/${PILOT}/backlog`)
    await page.waitForLoadState("networkidle").catch(() => {})
    log.push(`deactivate: browser navigation lands on ${new URL(page.url()).pathname}`)
    await page.screenshot({ path: shot("revocation-after-deactivate") })
    expect(page.url()).toContain("/login")
    // Deactivated user cannot log in again
    const relogin = await apiLogin(email).then(() => "ok").catch((e: Error) => e.message)
    log.push(`deactivate: re-login -> ${relogin}`)
    expect(relogin).not.toBe("ok")

    // ---- reactivate: old cookie stays dead, fresh login works
    expect((await admin.patch(`/api/users/${userId}`, { data: { isActive: true } })).status()).toBe(200)
    const oldCookie = (await api.get(`/api/projects/${PILOT}`)).status()
    log.push(`reactivate: old session -> ${oldCookie}; old token -> ${(await bearerCtx.get("/api/v1/me")).status()}`)
    expect(oldCookie).toBe(401)
    const api2 = await apiLogin(email)
    expect((await api2.get(`/api/projects/${PILOT}`)).status()).toBe(200)

    // ---- role change
    expect((await admin.patch(`/api/users/${userId}`, { data: { role: "section_manager" } })).status()).toBe(200)
    const r2 = await pollUntil401(api2, `/api/projects/${PILOT}`)
    log.push(`role change: session API -> ${r2.status} after ${r2.ms} ms`)
    expect(r2.status).toBe(401)
    expect((await admin.patch(`/api/users/${userId}`, { data: { role: "member" } })).status()).toBe(200)

    // ---- non-revoking change (name) keeps the session
    const api3 = await apiLogin(email)
    expect((await admin.patch(`/api/users/${userId}`, { data: { name: "Plat Revocation 2" } })).status()).toBe(200)
    const keep = (await api3.get(`/api/projects/${PILOT}`)).status()
    log.push(`name change: session -> ${keep}`)
    expect(keep).toBe(200)

    // ---- admin cannot lock themselves out
    const self = await admin.patch(`/api/users/e2eadmin0000000000000001`, { data: { isActive: false } })
    log.push(`admin self-deactivate -> ${self.status()} ${(await self.text()).slice(0, 120)}`)
    expect(self.status()).toBeGreaterThanOrEqual(400)
    await ctx.close()
  } finally {
    // Cleanup: deactivate the throwaway user and remove membership
    await admin.patch(`/api/users/${userId}`, { data: { isActive: false } })
    fs.writeFileSync(`${DATA}/platform-revocation.log`, log.join("\n"))
    note({ kind: "revocation", log })
  }
})

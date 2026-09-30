import { request as pwRequest, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"

export const BASE = process.env.E2E_BASE_URL || "http://localhost:3104"
export const PASSWORD = "E2e-Kanflow-2026!"
export const PILOT = "cmr8tnrzm0000m09lghm5jshr"
export const ZEVA = "cmouvgryo0004eg9lpqdtctmq"
export const SHOTS = "D:/APP/Kanflow-e2e/reports/shots"
export const DATA = "D:/APP/Kanflow-e2e/reports/platform-data"
fs.mkdirSync(DATA, { recursive: true })

export const USERS = {
  admin: "e2e-admin@example.test",
  po: "e2e-po@example.test",
  sm: "e2e-sm@example.test",
  dev: "e2e-dev@example.test",
  sec: "e2e-sec@example.test",
} as const
export type Role = keyof typeof USERS

const AUTH_DIR = path.join(__dirname, ".auth-platform")

/** Log in through the next-auth credentials callback; returns an API context carrying the session cookie. */
export async function apiLogin(email: string, password = PASSWORD): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: BASE })
  const csrfRes = await ctx.get("/api/auth/csrf")
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
  const res = await ctx.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password, callbackUrl: BASE + "/" },
    maxRedirects: 0,
  })
  if (res.status() !== 302 && res.status() !== 200) throw new Error(`login ${email} -> ${res.status()}`)
  const state = await ctx.storageState()
  if (!state.cookies.some((c) => c.name.includes("session-token"))) throw new Error(`login ${email}: no session cookie`)
  return ctx
}

/** Storage-state file for a role (created once per worker run, reused while fresh). */
export async function storageFor(role: Role): Promise<string> {
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  const file = path.join(AUTH_DIR, `${role}.json`)
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 30 * 60_000) {
    // Parallel evaluators may revoke sessions (deactivate / role change): verify before reuse.
    const probe = await pwRequest.newContext({ baseURL: BASE, storageState: file })
    const ok = (await probe.get("/api/user/api-tokens")).status() === 200
    await probe.dispose()
    if (ok) return file
  }
  const ctx = await apiLogin(USERS[role])
  await ctx.storageState({ path: file })
  await ctx.dispose()
  return file
}

export async function contextFor(browser: Browser, role: Role, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE, storageState: await storageFor(role), ...opts })
}

export async function apiFor(role: Role): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE, storageState: await storageFor(role) })
}

export function shot(name: string): string {
  fs.mkdirSync(SHOTS, { recursive: true })
  return `${SHOTS}/platform-${process.env.PLAT_TAG ?? "c2-"}${name}.png`
}

/** Append a line to a JSON-lines findings log (for the report). */
export function note(obj: Record<string, unknown>): void {
  fs.mkdirSync(path.join(__dirname, "..", "..", "test-results"), { recursive: true })
  fs.appendFileSync(path.join(__dirname, "..", "..", "test-results", "platform-notes.jsonl"), JSON.stringify(obj) + "\n")
}

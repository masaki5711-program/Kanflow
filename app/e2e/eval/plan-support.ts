import fs from "node:fs"
import path from "node:path"
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"
import { loginViaUi } from "../support/login"

export const PASSWORD = "E2e-Kanflow-2026!"
export const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
export const PROJECT2 = "cmouvgryo0004eg9lpqdtctmq"
export const PLAN = `/projects/${PROJECT}/plan`
export const SHOTS = "D:/APP/Kanflow-e2e/reports/shots/plan"
export const USERS = {
  admin: "e2e-admin@example.test",
  po: "e2e-po@example.test",
  sm: "e2e-sm@example.test",
  dev: "e2e-dev@example.test",
} as const
export type Role = keyof typeof USERS

const STATE_DIR = "C:/Users/fujikawa/AppData/Local/Temp/claude/D--APP-Kanflow/3065c797-7a23-4897-8778-6275c9a5a863/scratchpad/plan-auth"

export interface Issues { console: string[]; failed: string[] }

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

export function report(name: string, issues: Issues) {
  const uniq = (a: string[]) => [...new Set(a)]
  console.log(`\n=== ISSUES ${name} ===\nconsole:\n${uniq(issues.console).join("\n")}\nfailed:\n${uniq(issues.failed).join("\n")}\n`)
}

/** New context logged in as `role` (storage state cached on disk for the run). */
export async function userPage(
  browser: Browser,
  role: Role,
  opts: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ ctx: BrowserContext; page: Page; issues: Issues }> {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const file = path.join(STATE_DIR, `${role}.json`)
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 60 * 60 * 1000
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts, ...(fresh ? { storageState: file } : {}) })
  const page = await ctx.newPage()
  const issues = watch(page)
  if (!fresh) {
    await loginViaUi(page, USERS[role], PASSWORD)
    await ctx.storageState({ path: file })
  }
  return { ctx, page, issues }
}

type Json = Record<string, unknown>
export async function api(page: Page, method: string, url: string, data?: unknown): Promise<{ status: number; body: any }> {
  const origin = "http://localhost:3100"
  const res = await page.request.fetch(url.startsWith("http") ? url : origin + url, {
    method,
    data: data as Json | undefined,
    headers: { "content-type": "application/json", origin },
  })
  let body: any = {}
  try { body = await res.json() } catch { /* not json */ }
  return { status: res.status(), body }
}

export interface Item {
  id: string; name: string; parentId: string | null; plannedStart: string; plannedEnd: string
  isMilestone: boolean; status: string; progressPct: number; progressMode: string; scheduleState: string
  version?: number; baselineStart?: string | null; baselineEnd?: string | null; baselineVarianceDays?: number | null
  linked?: { pbiCount: number; pbiDone: number } | null; description?: string | null; owner?: { id: string; name: string } | null
}

export async function getPlan(page: Page, project = PROJECT): Promise<{ items: Item[]; dependencies: any[]; today: string }> {
  const r = await api(page, "GET", `/api/projects/${project}/plan`)
  const b = r.body?.data ?? r.body
  return b
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
export function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return ymd(d)
}

export async function createItem(page: Page, input: Json, project = PROJECT): Promise<Item> {
  const r = await api(page, "POST", `/api/projects/${project}/plan`, input)
  if (r.status >= 300) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`)
  return (r.body?.data ?? r.body) as Item
}

export async function patchItem(page: Page, id: string, patch: Json, project = PROJECT) {
  const plan = await getPlan(page, project)
  const it = plan.items.find((i) => i.id === id)
  return api(page, "PATCH", `/api/projects/${project}/plan/${id}`, { ...patch, version: it?.version })
}

export async function deleteItem(page: Page, id: string, project = PROJECT) {
  const plan = await getPlan(page, project)
  const it = plan.items.find((i) => i.id === id)
  return api(page, "DELETE", `/api/projects/${project}/plan/${id}${it?.version !== undefined ? `?version=${it.version}` : ""}`)
}

/** Remove every E2E- prefixed root item created by this suite (best effort). */
export async function cleanupE2E(page: Page, prefix: string, project = PROJECT) {
  const plan = await getPlan(page, project)
  for (const it of plan.items.filter((i) => i.name.startsWith(prefix) && !plan.items.some((p) => p.id === i.parentId && p.name.startsWith(prefix)))) {
    await deleteItem(page, it.id, project)
  }
}

export async function gotoPlan(page: Page, query = "", project = PROJECT) {
  await page.goto(`/projects/${project}/plan${query}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("[data-plan-chart], [data-plan-bar]").first().or(page.getByText(/まだ計画項目がありません|No plan items|Belum ada/))).toBeVisible({ timeout: 30_000 })
}

export const bar = (page: Page, id: string) => page.locator(`[data-plan-bar="${id}"]`)
export const row = (page: Page, id: string) => page.locator(`[data-plan-row="${id}"]`)
export const nameBtn = (page: Page, id: string) => page.locator(`[data-plan-name="${id}"]`)

export const stamp = () => new Date().toISOString().replace(/[-:T.Z]/g, "").slice(4, 12)

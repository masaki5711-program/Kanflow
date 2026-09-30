/**
 * Platform eval (cycle 1): authorization matrix via API + UI, and IDOR probes.
 * Read-mostly: the only writes are no-op PUT/PATCH replays that must be refused.
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test"
import * as fs from "node:fs"
import { DATA, apiFor, BASE, contextFor, note, PILOT, shot, ZEVA, type Role } from "./platform-helpers"

const ZEVA_SPRINT = "cmuktxfy1002bj49liopm4zcc"
const ZEVA_TASK = "cmuktxfy2002cj49l10pft0m0"
const ZEVA_PBI = "cmuktnln7002aj49lwxdg22dt"
const PILOT_SPRINT = "cmtb4vbdm006avk9lucrwszia"

type Who = Role | "anon"
const WHO: Who[] = ["admin", "po", "sm", "dev", "sec", "anon"]

async function ctxFor(who: Who): Promise<APIRequestContext> {
  if (who === "anon") return pwRequest.newContext({ baseURL: BASE })
  return apiFor(who)
}

type Row = { method: "GET" | "PUT" | "PATCH" | "POST" | "DELETE"; path: string; body?: unknown; expect: Record<Who, number | number[]> }

const ADMIN_ONLY = { admin: 200, po: 403, sm: 403, dev: 403, sec: 403, anon: 401 }
const PILOT_VIEW = { admin: 200, po: 200, sm: 200, dev: 200, sec: 200, anon: 401 }
const ZEVA_VIEW = { admin: 200, po: 200, sm: 404, dev: 404, sec: 404, anon: 401 }

const ROWS: Row[] = [
  { method: "GET", path: `/api/projects/${PILOT}`, expect: PILOT_VIEW },
  { method: "GET", path: `/api/projects/${PILOT}/members`, expect: PILOT_VIEW },
  { method: "POST", path: `/api/projects/${PILOT}/members`, body: {}, expect: { admin: 400, po: 400, sm: 400, dev: 403, sec: 403, anon: 401 } },
  { method: "GET", path: `/api/projects/${PILOT}/trash`, expect: { admin: 200, po: 200, sm: 200, dev: 403, sec: 403, anon: 401 } },
  { method: "GET", path: `/api/projects/${PILOT}/surveillance-settings`, expect: PILOT_VIEW },
  { method: "PUT", path: `/api/projects/${PILOT}/surveillance-settings`, body: "__replay__", expect: { admin: 200, po: 200, sm: 403, dev: 403, sec: 403, anon: 401 } },
  { method: "GET", path: `/api/projects/${PILOT}/backlog`, expect: PILOT_VIEW },
  { method: "GET", path: `/api/projects/${PILOT}/ai/jobs`, expect: PILOT_VIEW },
  { method: "GET", path: `/api/projects/${PILOT}/chat/threads`, expect: { admin: 200, po: 200, sm: 200, dev: 200, sec: 403, anon: 401 } },
  { method: "DELETE", path: `/api/projects/${PILOT}/trash/pbi/nonexistent`, expect: { admin: 404, po: 404, sm: 403, dev: 403, sec: 403, anon: 401 } },
  // Other project (dev / sm / sec are not members, no shared section)
  { method: "GET", path: `/api/projects/${ZEVA}`, expect: ZEVA_VIEW },
  { method: "GET", path: `/api/projects/${ZEVA}/backlog`, expect: ZEVA_VIEW },
  { method: "GET", path: `/api/projects/${ZEVA}/sprints/${ZEVA_SPRINT}`, expect: ZEVA_VIEW },
  { method: "GET", path: `/api/projects/${ZEVA}/members`, expect: ZEVA_VIEW },
  { method: "GET", path: `/api/projects/${ZEVA}/activity`, expect: ZEVA_VIEW },
  { method: "GET", path: `/api/projects/${ZEVA}/surveillance-settings`, expect: ZEVA_VIEW },
  // Cross-project IDOR: ZEVA ids under the PILOT path (where the caller is a member)
  { method: "GET", path: `/api/projects/${PILOT}/sprints/${ZEVA_SPRINT}`, expect: { admin: 404, po: 404, sm: 404, dev: 404, sec: 404, anon: 401 } },
  { method: "GET", path: `/api/projects/${PILOT}/backlog/${ZEVA_PBI}`, expect: { admin: 404, po: 404, sm: 404, dev: 404, sec: 404, anon: 401 } },
  { method: "PATCH", path: `/api/projects/${PILOT}/sprints/${ZEVA_SPRINT}/tasks/${ZEVA_TASK}`, body: { status: "todo" }, expect: { admin: 404, po: 404, sm: 404, dev: 404, sec: 403, anon: 401 } },
  { method: "PATCH", path: `/api/projects/${PILOT}/sprints/${PILOT_SPRINT}/tasks/${ZEVA_TASK}`, body: { status: "todo" }, expect: { admin: 404, po: 404, sm: 404, dev: 404, sec: 403, anon: 401 } },
  { method: "GET", path: `/api/projects/${PILOT}/comments?entityType=pbi&entityId=${ZEVA_PBI}`, expect: { admin: 404, po: 404, sm: 404, dev: 404, sec: 404, anon: 401 } },
  { method: "GET", path: `/api/projects/${PILOT}/activity/pbi/${ZEVA_PBI}`, expect: { admin: [200, 404], po: [200, 404], sm: [200, 404], dev: [200, 404], sec: [200, 404], anon: 401 } },
  // Portfolio
  { method: "GET", path: `/api/portfolio`, expect: { admin: 200, po: 403, sm: 403, dev: 403, sec: 200, anon: 401 } },
  // Admin
  { method: "GET", path: `/api/admin/metrics`, expect: ADMIN_ONLY },
  { method: "GET", path: `/api/admin/api-tokens`, expect: ADMIN_ONLY },
  { method: "GET", path: `/api/admin/trash/projects`, expect: ADMIN_ONLY },
  { method: "GET", path: `/api/users`, expect: ADMIN_ONLY },
  { method: "GET", path: `/api/admin/sections`, expect: ADMIN_ONLY },
  { method: "GET", path: `/api/admin/translations/stats`, expect: ADMIN_ONLY },
  { method: "GET", path: `/api/admin/glossary`, expect: ADMIN_ONLY },
  // Session cookie must not be accepted on v1
  { method: "GET", path: `/api/v1/me`, expect: { admin: 401, po: 401, sm: 401, dev: 401, sec: 401, anon: 401 } },
]

test.describe.configure({ mode: "serial" })
test.setTimeout(600_000)

test("API authorization matrix + IDOR", async () => {
  const ctxs = Object.fromEntries(await Promise.all(WHO.map(async (w) => [w, await ctxFor(w)] as const))) as Record<Who, APIRequestContext>
  const admin = ctxs.admin
  const surv = await (await admin.get(`/api/projects/${PILOT}/surveillance-settings`)).json()
  const survBody = surv?.settings ?? surv
  const results: string[] = []
  const mismatches: string[] = []
  for (const row of ROWS) {
    const cells: string[] = []
    for (const who of WHO) {
      const body = row.body === "__replay__" ? survBody : row.body
      const res = await ctxs[who].fetch(row.path, { method: row.method, data: body, failOnStatusCode: false, maxRedirects: 0 })
      const status = res.status()
      const exp = row.expect[who]
      const ok = Array.isArray(exp) ? exp.includes(status) : exp === status
      let extra = ""
      if (row.path === "/api/portfolio" && status === 200) {
        const j = await res.json()
        extra = ` scope=${j.scope} projects=${(j.projects ?? j.rows ?? []).length}`
      }
      cells.push(`${who}:${status}${ok ? "" : "!"}${extra}`)
      if (!ok) mismatches.push(`${row.method} ${row.path} as ${who}: got ${status}, expected ${JSON.stringify(exp)} body=${(await res.text()).slice(0, 160)}`)
    }
    results.push(`${row.method} ${row.path} | ${cells.join(" ")}`)
  }
  fs.writeFileSync(DATA + "/platform-authz-matrix.txt", results.join("\n") + "\n\nMISMATCHES:\n" + mismatches.join("\n"))
  note({ kind: "authz-matrix", mismatches })
  for (const c of Object.values(ctxs)) await c.dispose()
  expect.soft(mismatches, mismatches.join("\n")).toEqual([])
})

const PAGES = [
  "/",
  `/projects/${PILOT}`,
  `/projects/${PILOT}/settings`,
  `/projects/${PILOT}/trash`,
  `/projects/${ZEVA}`,
  `/projects/${ZEVA}/backlog`,
  `/projects/${ZEVA}/settings`,
  "/portfolio",
  "/admin/users",
  "/admin/metrics",
  "/admin/api-tokens",
  "/admin/trash",
]

test("UI page access per role", async ({ browser }) => {
  const lines: string[] = []
  for (const who of WHO) {
    const ctx = who === "anon" ? await browser.newContext({ baseURL: BASE }) : await contextFor(browser, who)
    const page = await ctx.newPage()
    for (const p of PAGES) {
      const res = await page.goto(p, { waitUntil: "domcontentloaded" }).catch(() => null)
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
      const url = new URL(page.url()).pathname
      const h1 = (await page.locator("h1, h2").first().textContent({ timeout: 2000 }).catch(() => ""))?.trim().slice(0, 50)
      const notFound = await page.getByText(/404|見つかりません|not found|tidak ditemukan/i).first().isVisible().catch(() => false)
      lines.push(`${who.padEnd(5)} ${p.padEnd(48)} -> ${res?.status() ?? "ERR"} ${url} ${notFound ? "[404-text]" : ""} "${h1}"`)
      if (p === `/projects/${ZEVA}` && (who === "dev" || who === "sec")) await page.screenshot({ path: shot(`authz-zeva-as-${who}`) })
      if (p === "/admin/metrics" && who === "dev") await page.screenshot({ path: shot(`authz-admin-metrics-as-dev`) })
      if (p === "/portfolio" && who === "sec") await page.screenshot({ path: shot(`authz-portfolio-as-sec`), fullPage: true })
    }
    await ctx.close()
  }
  fs.writeFileSync(DATA + "/platform-authz-pages.txt", lines.join("\n"))
  // anonymous users must land on /login everywhere
  const anonLeaks = lines.filter((l) => l.startsWith("anon") && !l.includes(" /login"))
  expect.soft(anonLeaks).toEqual([])
  // non-admins must not stay on /admin/*
  const adminLeaks = lines.filter((l) => !l.startsWith("admin") && !l.startsWith("anon") && /\/admin\/\S+ -> \d+ \/admin\//.test(l))
  expect.soft(adminLeaks).toEqual([])
})

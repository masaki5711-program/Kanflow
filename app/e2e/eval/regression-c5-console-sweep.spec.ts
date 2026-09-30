import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import { contextFor, PILOT, ZEVA, type Role } from "./platform-helpers"

/**
 * Regression cycle 5 — read-only console sweep.
 * Loads the main pages as each role (twice, fresh navigation) and records
 * browser console errors / page errors, counting React hydration error #418
 * per page. POSTs that could reach Ollama are aborted so the sweep never
 * spends the shared AI budget.
 */
const OUT = "D:/APP/Kanflow-e2e/reports/c5-logs/console-sweep.json"
const LOADS_PER_PAGE = 2
const AI_POST = /\/(ai|chat|report|generate|summar|surveil)/i

const P = `/projects/${PILOT}`
const PAGES: Record<Role, string[]> = {
  po: ["/", "/portfolio", "/me", P, `${P}/backlog`, `${P}/sprints`, `${P}/sprints?view=board`, `${P}/plan`, `${P}/gantt`, `${P}/burndown`, `${P}/calendar`, `${P}/releases`, `${P}/icebox`, `${P}/report`, `${P}/chat`, `${P}/settings`, `${P}/guide`, `/projects/${ZEVA}/plan`],
  sm: ["/", P, `${P}/backlog`, `${P}/sprints?view=board`, `${P}/plan`, `${P}/gantt`],
  dev: ["/", P, `${P}/backlog`, `${P}/sprints?view=board`, `${P}/plan`, `${P}/gantt`, "/me"],
  sec: ["/", "/portfolio", P, `${P}/backlog`, `${P}/sprints`, `${P}/plan`, `${P}/gantt`, `${P}/burndown`],
  admin: ["/", "/admin/users", "/admin/sections", "/admin/translations", "/admin/metrics", "/admin/trash", "/admin/glossary", "/admin/api-tokens", "/admin/categories"],
}

interface PageResult { role: Role; path: string; load: number; status: number | null; h418: number; pageErrors: string[]; consoleErrors: string[]; http5xx: string[]; abortedAi: string[] }

async function sweep(page: Page, role: Role, path: string, load: number): Promise<PageResult> {
  const r: PageResult = { role, path, load, status: null, h418: 0, pageErrors: [], consoleErrors: [], http5xx: [], abortedAi: [] }
  const onErr = (e: Error) => { r.pageErrors.push(e.message.slice(0, 300)); if (/#418/.test(e.message)) r.h418++ }
  const onConsole = (m: import("@playwright/test").ConsoleMessage) => {
    if (m.type() !== "error") return
    r.consoleErrors.push(m.text().slice(0, 300))
    if (/#418/.test(m.text())) r.h418++
  }
  const onResp = (res: import("@playwright/test").Response) => { if (res.status() >= 500) r.http5xx.push(`${res.status()} ${res.url()}`) }
  page.on("pageerror", onErr)
  page.on("console", onConsole)
  page.on("response", onResp)
  const res = await page.goto(path, { waitUntil: "load" })
  r.status = res?.status() ?? null
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(800)
  page.off("pageerror", onErr)
  page.off("console", onConsole)
  page.off("response", onResp)
  return r
}

test.describe.configure({ mode: "serial" })
const results: PageResult[] = []

for (const role of Object.keys(PAGES) as Role[]) {
  test(`console sweep as ${role}`, async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await contextFor(browser, role)
    await ctx.route("**/api/**", (route) => {
      const req = route.request()
      if (req.method() !== "GET" && AI_POST.test(new URL(req.url()).pathname)) {
        results.push({ role, path: "(aborted)", load: 0, status: null, h418: 0, pageErrors: [], consoleErrors: [], http5xx: [], abortedAi: [`${req.method()} ${req.url()}`] })
        return route.abort()
      }
      return route.continue()
    })
    const page = await ctx.newPage()
    for (const path of PAGES[role]) {
      for (let i = 1; i <= LOADS_PER_PAGE; i++) results.push(await sweep(page, role, path, i))
    }
    await ctx.close()
    fs.writeFileSync(OUT, JSON.stringify(results, null, 1))
    const mine = results.filter((x) => x.role === role && x.path !== "(aborted)")
    for (const x of mine) {
      if (x.h418 || x.pageErrors.length || x.consoleErrors.length || x.http5xx.length) console.log(JSON.stringify(x))
    }
    // meaningful gates: every page renders (< 400) and no 5xx during load
    expect(mine.filter((x) => (x.status ?? 0) >= 400).map((x) => `${x.status} ${x.path}`)).toEqual([])
    expect(mine.flatMap((x) => x.http5xx)).toEqual([])
  })
}

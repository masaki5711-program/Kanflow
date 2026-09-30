/** Platform eval (cycle 2): which elements overflow at 375 px (home, admin users, dashboard sprint card). */
import { test } from "@playwright/test"
import * as fs from "node:fs"
import { contextFor, DATA, PILOT, shot, type Role } from "./platform-helpers"

test.setTimeout(180_000)
test("375 px overflow offenders", async ({ browser }) => {
  const out: string[] = []
  for (const [role, name, url] of [["dev", "home", "/"], ["admin", "admin-users", "/admin/users"], ["dev", "dashboard", `/projects/${PILOT}`]] as Array<[Role, string, string]>) {
    const ctx = await contextFor(browser, role, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto(url)
    await page.waitForLoadState("networkidle").catch(() => {})
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const res: string[] = []
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
        const b = el.getBoundingClientRect()
        if (b.right <= vw + 1 || b.width === 0) continue
        const parentOver = el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1
        if (parentOver && res.length > 0) continue
        res.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 90)} right=${Math.round(b.right)} w=${Math.round(b.width)} text="${(el.innerText || "").replace(/\s+/g, " ").slice(0, 60)}"`)
        if (res.length > 6) break
      }
      return res
    })
    out.push(`[${role} ${name}]`, ...r.map((x) => "  " + x))
    const first = page.locator("main article, main table, main section").first()
    await page.screenshot({ path: shot(`overflow-${name}`), fullPage: true })
    void first
    await ctx.close()
  }
  fs.writeFileSync(`${DATA}/c2-overflow-probe.log`, out.join("\n") + "\n")
})

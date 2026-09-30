import { test } from "@playwright/test"
import { open, visit, snap, dump, overflow, textMatches, flushErrs, PILOT, type Role } from "./accept-helpers"

/**
 * Acceptance cycle 3 — screen survey. For each persona: every relevant screen at
 * 1440 and 375, with timing, overflow, untranslated-string sniffing and ARIA dump.
 */
test.describe.configure({ mode: "serial" })
test.setTimeout(600_000)

const P = `/projects/${PILOT}`
const SCREENS: Record<Role, [string, string][]> = {
  po: [["home", "/"], ["dash", P], ["backlog", `${P}/backlog`], ["plan", `${P}/plan`], ["sprints", `${P}/sprints`], ["burndown", `${P}/burndown`], ["gantt", `${P}/gantt`], ["calendar", `${P}/calendar`], ["releases", `${P}/releases`], ["icebox", `${P}/icebox`], ["report", `${P}/report`], ["settings", `${P}/settings`], ["trash", `${P}/trash`], ["guide", `${P}/guide`], ["me", "/me"]],
  dev: [["home", "/"], ["dash", P], ["sprints", `${P}/sprints`], ["burndown", `${P}/burndown`], ["backlog", `${P}/backlog`], ["plan", `${P}/plan`], ["me", "/me"]],
  sec: [["home", "/"], ["portfolio", "/portfolio"], ["dash", P], ["plan", `${P}/plan`], ["backlog", `${P}/backlog`], ["sprints", `${P}/sprints`]],
  admin: [["home", "/"], ["users", "/admin/users"], ["metrics", "/admin/metrics"], ["tokens", "/admin/api-tokens"], ["trash", "/admin/trash"], ["sections", "/admin/sections"], ["translations", "/admin/translations"], ["glossary", "/admin/glossary"], ["categories", "/admin/categories"]],
  sm: [],
}
const LANG: Record<Role, "ja" | "id"> = { po: "ja", dev: "id", sec: "ja", admin: "ja", sm: "ja" }
// Japanese chars in an Indonesian UI, or ASCII-only words in a Japanese UI that look like UI labels.
const JA_RE = /[぀-ヿ一-龯]/

for (const role of ["po", "dev", "sec", "admin"] as Role[]) {
  for (const width of [1440, 375]) {
    test(`survey ${role} @${width}`, async ({ browser }) => {
      const s = await open(browser, role, { width, height: width === 375 ? 812 : 900, lang: LANG[role], logFile: `survey-${role}.log` })
      for (const [name, url] of SCREENS[role]) {
        const ms = await visit(s, url, `${role}/${name}@${width}`)
        await s.page.waitForTimeout(600)
        await snap(s, `${role}-${name}-${width}`)
        const ov = await overflow(s)
        s.log(`  overflow=${ov}px load=${ms}ms`)
        if (width === 1440) {
          await dump(s, `${role}-${name}`)
          if (LANG[role] === "id") {
            const ja = await textMatches(s, JA_RE)
            s.log(`  JA-in-ID (${ja.length}): ${ja.slice(0, 40).join(" | ")}`)
          } else {
            const en = await textMatches(s, /^[A-Za-z][A-Za-z ()/&'-]{2,}$/)
            s.log(`  ASCII-in-JA (${en.length}): ${en.slice(0, 60).join(" | ")}`)
          }
        }
        flushErrs(s, `${role}/${name}@${width}`)
      }
      await s.ctx.close()
    })
  }
}

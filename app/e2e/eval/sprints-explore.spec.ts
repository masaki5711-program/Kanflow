import { test } from "@playwright/test"
import * as fs from "node:fs"
import { newUserPage, readState, report, shot } from "./sprints-support"

const dump = (name: string, txt: string) => fs.writeFileSync(`D:/APP/Kanflow-e2e/reports/_sprints-aria-${name}.txt`, txt)

/** Exploration helper: dumps aria snapshots + screenshots of sprint page states (not an assertion spec). */
test("explore", async ({ browser }) => {
  const s = readState()
  const role = (process.env.EX_ROLE ?? "po") as "po"
  const { ctx, page, issues } = await newUserPage(browser, role)
  await page.goto(process.env.EX_URL ?? `/projects/${s.projectId}/sprints`)
  await page.waitForTimeout(Number(process.env.EX_WAIT ?? 4000))
  const name = process.env.EX_NAME ?? "x"
  await shot(page, `explore-${name}`)
  dump(name, await page.locator(process.env.EX_ROOT ?? "main").ariaSnapshot())
  report("explore", issues)
  await ctx.close()
})

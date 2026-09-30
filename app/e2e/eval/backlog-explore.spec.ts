import { test } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"
import fs from "node:fs"

test("explore modal edit + create + comments", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: `E2E-EXPLORE-${stamp()}`, userStory: "E2E として探索したい。", workloadScore: 1 })
  const pbi = (r.body.data ?? r.body) as { id: string; displayId: number }
  await page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("button", { name: "編集" }).click()
  await page.waitForTimeout(1000)
  fs.writeFileSync(`${SHOTS}/../_aria-edit.txt`, await dlg.ariaSnapshot())
  await page.screenshot({ path: `${SHOTS}/pbi-modal-edit.png` })
  await dlg.getByRole("button", { name: "キャンセル" }).click()
  await dlg.getByRole("tab", { name: "コメント" }).click()
  await page.waitForTimeout(800)
  fs.writeFileSync(`${SHOTS}/../_aria-comments.txt`, await dlg.ariaSnapshot())
  await dlg.getByRole("tab", { name: "履歴" }).click()
  await page.waitForTimeout(800)
  fs.writeFileSync(`${SHOTS}/../_aria-history.txt`, await dlg.ariaSnapshot())
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "PBI追加" }).first().click()
  await page.waitForTimeout(1000)
  fs.writeFileSync(`${SHOTS}/../_aria-create.txt`, await page.getByRole("dialog").ariaSnapshot())
  await page.screenshot({ path: `${SHOTS}/pbi-create-modal.png` })
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("explore", issues)
})

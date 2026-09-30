import { test } from "@playwright/test"
import { PROJECT, PROJECT2, api, deleteItem, getPlan, userPage } from "./plan-support"

/** Housekeeping: move leftover plan-suite data (E2E-<letter><stamp> items, E2E-C events, E2E-P PBIs) to the trash. */
test("cleanup leftover plan-eval data", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  const mine = /^E2E-[A-Z]\d{8} |^E2E-should-not-exist|^E2E-hack/
  for (const p of [PROJECT, PROJECT2]) {
    const plan = await getPlan(page, p)
    const ids = new Set(plan.items.filter((i) => mine.test(i.name)).map((i) => i.id))
    const roots = plan.items.filter((i) => ids.has(i.id) && !(i.parentId && ids.has(i.parentId)))
    for (const r of roots) console.log(p, "trash", r.name, (await deleteItem(page, r.id, p)).status)
  }
  const ev = await api(page, "GET", `/api/projects/${PROJECT}/events`)
  const events = (ev.body?.data ?? ev.body) as any
  const list = Array.isArray(events) ? events : events?.events ?? []
  for (const e of list.filter((x: any) => /^E2E-C\d{8} /.test(x.title ?? ""))) console.log("delete event", e.title, (await api(page, "DELETE", `/api/projects/${PROJECT}/events/${e.id}`)).status)
  const bl = await api(page, "GET", `/api/projects/${PROJECT}/backlog`)
  const items = (bl.body?.data ?? bl.body) as any
  const pbis = (Array.isArray(items) ? items : items?.items ?? []).filter((x: any) => /^E2E-P\d{8} pbi/.test(x.userStory ?? ""))
  if (pbis.length) console.log("trash pbis", pbis.length, (await api(page, "POST", `/api/projects/${PROJECT}/backlog/bulk`, { action: "trash", ids: pbis.map((x: any) => x.id) })).status)
  await ctx.close()
})

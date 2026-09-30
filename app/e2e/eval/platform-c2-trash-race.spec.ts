/**
 * Platform eval (cycle 2): P-07 / S-4 — admin project restore vs purge fired
 * concurrently must never report "restored" for a project that ends up purged.
 * Throwaway projects only (PLAT-RACE-*); every one is purged at the end.
 */
import { test, expect } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, DATA } from "./platform-helpers"

test.setTimeout(300_000)

test("restore vs purge race is serialized", async () => {
  const po = await apiFor("po")
  const admin = await apiFor("admin")
  const log: string[] = []
  const inconsistent: string[] = []
  for (let i = 0; i < 8; i++) {
    const created = await po.post("/api/projects", { data: { name: `PLAT-RACE-${Date.now()}-${i}`, description: "platform eval race" } })
    expect(created.status()).toBe(201)
    const id: string = (await created.json()).id
    expect([200, 204]).toContain((await po.delete(`/api/projects/${id}`)).status())
    // alternate which request is sent first
    const reqs = i % 2 === 0
      ? [admin.delete(`/api/admin/trash/projects/${id}`), admin.post(`/api/admin/trash/projects/${id}/restore`)]
      : [admin.post(`/api/admin/trash/projects/${id}/restore`), admin.delete(`/api/admin/trash/projects/${id}`)]
    const res = await Promise.all(reqs)
    const [purge, restore] = i % 2 === 0 ? res : [res[1], res[0]]
    const after = (await po.get(`/api/projects/${id}`)).status()
    const line = `#${i} purge=${purge.status()} restore=${restore.status()} -> project GET as PO ${after}`
    log.push(line)
    const purged = purge.status() === 200 || purge.status() === 204
    const restored = restore.status() === 200 || restore.status() === 204
    if (purged && restored) inconsistent.push(`${line} (both succeeded)`)
    if (restored && after !== 200) inconsistent.push(`${line} (restore said OK but project is gone)`)
    if (purged && after !== 404) inconsistent.push(`${line} (purge said OK but project is live)`)
    // cleanup: if it was restored, trash + purge it
    if (after === 200) {
      await po.delete(`/api/projects/${id}`)
      log.push(`   cleanup purge -> ${(await admin.delete(`/api/admin/trash/projects/${id}`)).status()}`)
    }
  }
  fs.writeFileSync(`${DATA}/c2-trash-race.log`, log.join("\n") + "\n\nINCONSISTENT:\n" + inconsistent.join("\n") + "\n")
  expect(inconsistent).toEqual([])
})

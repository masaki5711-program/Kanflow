/**
 * Platform eval (cycle 2): P-02 — AI proposal outcome is persisted and cannot be
 * approved twice. No Ollama request: re-uses the cycle-1 thread (owner = the
 * cycle-1 throwaway admin, re-activated for this run and deactivated again).
 */
import { test, expect, request as pwRequest, type Page, type Response } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, apiLogin, BASE, DATA, PILOT, shot } from "./platform-helpers"

test.describe.configure({ mode: "serial" })
test.setTimeout(600_000)

const log: string[] = []
const [OWNER_EMAIL, OWNER_ID] = fs.readFileSync(`${DATA}/cycle1/platform-ui-user.txt`, "utf8").trim().split(/\s+/)
const THREAD = fs.readFileSync(`${DATA}/cycle1/platform-ai-thread.txt`, "utf8").trim()
const PROPOSAL = "prop_be3ad7ce619db31c"
const url = (proposal = PROPOSAL, thread = THREAD) => `/api/projects/${PILOT}/chat/threads/${thread}/proposals/${proposal}`
const APPROVE = /承認して作成|Approve and create|Setujui/
const APPLIED = /反映済み|Applied|Sudah diterapkan/

test("P-02: persisted outcome, second tab and re-open cannot approve again", async ({ browser }) => {
  const admin = await apiFor("admin")
  log.push(`reactivate owner ${OWNER_EMAIL} -> ${(await admin.patch(`/api/users/${OWNER_ID}`, { data: { isActive: true } })).status()}`)
  const owner = await apiLogin(OWNER_EMAIL)
  await owner.patch("/api/user/language", { data: { language: "ja" } })
  const storage = await owner.storageState()
  try {
    // Authz of the new route
    const sec = await apiFor("sec")
    const dev = await apiFor("dev")
    const anon = await pwRequest.newContext({ baseURL: BASE })
    const authz = {
      anon: (await anon.post(url(), { data: { action: "reserve" } })).status(),
      sec: (await sec.post(url(), { data: { action: "reserve" } })).status(),
      dev_foreign_thread: (await dev.post(url(), { data: { action: "reserve" } })).status(),
      admin_foreign_thread: (await admin.post(url(), { data: { action: "reserve" } })).status(),
      owner_bad_action: (await owner.post(url(), { data: { action: "steal" } })).status(),
      owner_bad_id: (await owner.post(url("bad%2Fid"), { data: { action: "reserve" } })).status(),
      owner_unknown_proposal: (await owner.post(url("prop_0000"), { data: { action: "reserve" } })).status(),
      owner_zeva_path: (await owner.post(`/api/projects/cmouvgryo0004eg9lpqdtctmq/chat/threads/${THREAD}/proposals/${PROPOSAL}`, { data: { action: "reserve" } })).status(),
    }
    log.push(`authz proposals route: ${JSON.stringify(authz)}`)
    expect.soft(authz.anon).toBe(401)
    expect.soft(authz.sec).toBe(403)
    expect.soft(authz.dev_foreign_thread).toBe(404)
    expect.soft(authz.admin_foreign_thread).toBe(404)
    expect.soft(authz.owner_bad_action).toBe(400)
    expect.soft(authz.owner_unknown_proposal).toBe(404)
    expect.soft(authz.owner_zeva_path).toBe(404)

    // Cycle 3: the proposal was approved in cycle 2 and its outcome is persisted; no new
    // proposal can be produced without an Ollama request. In that state verify the
    // "already applied" contract instead of the first-approval race.
    const pre = JSON.stringify(await (await owner.get(`/api/projects/${PILOT}/chat/threads/${THREAD}`)).json())
    const preOutcome = pre.match(/"outcome":\{[^}]*\}/)?.[0] ?? ""
    log.push(`pre-run outcome: ${preOutcome || "(none)"}`)
    if (/applied/.test(preOutcome)) {
      const race = await Promise.all(Array.from({ length: 6 }, () => owner.post(url(), { data: { action: "reserve" } })))
      const codes = race.map((r) => r.status())
      log.push(`[applied] parallel reserve x6 -> ${codes.join(",")}`)
      expect.soft(codes.every((c) => c === 409), "no reserve may win on an applied proposal").toBe(true)
      const rej = await owner.post(url(), { data: { action: "reject" } })
      const rel = await owner.post(url(), { data: { action: "release" } })
      log.push(`[applied] reject -> ${rej.status()} release -> ${rel.status()}`)
      expect.soft(rej.status()).toBe(409)
      const ctx = await browser.newContext({ baseURL: BASE, storageState: storage })
      const c = await ctx.newPage()
      let creates = 0
      c.on("request", (r) => { if (r.url().endsWith(`/api/projects/${PILOT}/backlog`) && r.method() === "POST") creates++ })
      await c.goto(`/projects/${PILOT}/chat?thread=${THREAD}`)
      await c.waitForLoadState("networkidle").catch(() => {})
      await expect(c.getByText(APPLIED).first()).toBeVisible({ timeout: 30_000 })
      const reBtn = c.getByRole("button", { name: APPROVE })
      const reEnabled = (await reBtn.count()) ? await reBtn.first().isEnabled({ timeout: 5_000 }) : false
      log.push(`[applied] re-open: approve buttons=${await reBtn.count()} enabled=${reEnabled} applied=${await c.getByText(APPLIED).count()} backlog POSTs=${creates}`)
      await c.screenshot({ path: shot("c3-p02-reopened-applied"), fullPage: true })
      expect.soft(reEnabled).toBe(false)
      expect.soft(creates).toBe(0)
      const after = JSON.stringify(await (await owner.get(`/api/projects/${PILOT}/chat/threads/${THREAD}`)).json()).match(/"outcome":\{[^}]*\}/)?.[0]
      expect.soft(after, "stored outcome unchanged").toBe(preOutcome)
      await ctx.close()
      return
    }

    // Concurrency: 6 parallel reserves on the legacy (outcome-less) proposal -> exactly one wins
    const race = await Promise.all(Array.from({ length: 6 }, () => owner.post(url(), { data: { action: "reserve" } })))
    const codes = race.map((r) => r.status())
    log.push(`parallel reserve x6 -> ${codes.join(",")}`)
    expect.soft(codes.filter((c) => c === 200).length).toBe(1)
    const rel = await owner.post(url(), { data: { action: "release" } })
    log.push(`release -> ${rel.status()} ${await rel.text()}`)

    // (thread was soft-deleted at the end of cycle 1; restored in the eval DB with deletedAt=NULL before this run)
    // Two tabs on the same thread (both rendered while the proposal is still pending)
    const ctx = await browser.newContext({ baseURL: BASE, storageState: storage })
    const a = await ctx.newPage()
    const b = await ctx.newPage()
    const seen: Array<{ tab: string; r: Response }> = []
    for (const [tab, p] of [["A", a], ["B", b]] as Array<[string, Page]>) {
      p.on("response", (r) => {
        if (r.url().includes("/proposals/") || (r.url().endsWith(`/api/projects/${PILOT}/backlog`) && r.request().method() === "POST")) seen.push({ tab, r })
      })
      await p.goto(`/projects/${PILOT}/chat?thread=${THREAD}`)
      await p.waitForLoadState("networkidle").catch(() => {})
    }
    const aBtn = a.getByRole("button", { name: APPROVE }).first()
    const bBtn = b.getByRole("button", { name: APPROVE }).first()
    log.push(`before: A approve enabled=${await aBtn.isEnabled({ timeout: 15_000 }).catch(() => "n/a")}, B approve enabled=${await bBtn.isEnabled({ timeout: 15_000 }).catch(() => "n/a")}`)
    await a.screenshot({ path: shot("p02-before-approve"), fullPage: true })

    await aBtn.click()
    await expect(a.getByText(APPLIED).first()).toBeVisible({ timeout: 30_000 })
    await a.waitForTimeout(1000)
    await a.screenshot({ path: shot("p02-tab-a-applied"), fullPage: true })

    await bBtn.click()
    await b.waitForTimeout(4000)
    const toasts = (await b.locator("[role=status],[role=alert]").allTextContents()).filter(Boolean).join(" | ")
    await b.screenshot({ path: shot("p02-tab-b-second-approve"), fullPage: true })
    const summary = await Promise.all(seen.map(async ({ tab, r }) => `${tab} ${r.request().method()} ${new URL(r.url()).pathname.replace(`/api/projects/${PILOT}`, "")} ${JSON.stringify(r.request().postDataJSON?.() ?? null)} -> ${r.status()}`))
    log.push(...summary.map((s) => `  net: ${s}`))
    log.push(`tab B after second approve: applied badge=${await b.getByText(APPLIED).count()} toasts="${toasts}"`)
    const creates = seen.filter(({ r }) => r.url().endsWith("/backlog"))
    expect.soft(creates.length, "exactly one POST /backlog").toBe(1)
    expect.soft(creates.every(({ tab }) => tab === "A")).toBe(true)
    const created = creates[0] ? await creates[0].r.json() : null
    log.push(`created PBI #${created?.displayId} id=${created?.id}`)

    // Re-open: card must show the applied state
    const c = await ctx.newPage()
    await c.goto(`/projects/${PILOT}/chat?thread=${THREAD}`)
    await c.waitForLoadState("networkidle").catch(() => {})
    const reBtn = c.getByRole("button", { name: APPROVE })
    const reEnabled = (await reBtn.count()) ? await reBtn.first().isEnabled({ timeout: 5_000 }) : false
    const reApplied = await c.getByText(APPLIED).count()
    const openLink = await c.getByRole("link", { name: /開く|Open|Buka/ }).count()
    log.push(`re-open: approve buttons=${await reBtn.count()} enabled=${reEnabled} applied badges=${reApplied} open links=${openLink}`)
    await c.screenshot({ path: shot("p02-reopened"), fullPage: true })
    expect.soft(reEnabled).toBe(false)
    expect.soft(reApplied).toBeGreaterThan(0)

    // API: stored outcome, further transitions refused
    const again = await owner.post(url(), { data: { action: "reserve" } })
    const rej = await owner.post(url(), { data: { action: "reject" } })
    const thread = await (await owner.get(`/api/projects/${PILOT}/chat/threads/${THREAD}`)).json()
    const stored = JSON.stringify(thread).match(/"outcome":\{[^}]*\}/)?.[0]
    log.push(`reserve again -> ${again.status()} ${await again.text()} | reject -> ${rej.status()} | thread GET outcome: ${stored}`)
    expect.soft(again.status()).toBe(409)
    expect.soft(rej.status()).toBe(409)
    expect.soft(stored ?? "").toContain(created?.id ?? "__none__")

    // Cleanup the created PBI (trash)
    if (created?.id) log.push(`cleanup PBI -> ${(await owner.delete(`/api/projects/${PILOT}/backlog/${created.id}`)).status()}`)
    // A reopened card after the PBI was trashed
    await c.reload()
    await c.waitForLoadState("networkidle").catch(() => {})
    log.push(`after trashing the PBI: approve enabled=${(await reBtn.count()) ? await reBtn.first().isEnabled({ timeout: 5_000 }) : false}, applied=${await c.getByText(APPLIED).count()}`)
    await c.screenshot({ path: shot("p02-reopened-after-trash"), fullPage: true })
    await ctx.close()
  } finally {
    log.push(`deactivate owner -> ${(await admin.patch(`/api/users/${OWNER_ID}`, { data: { isActive: false } })).status()}`)
    fs.writeFileSync(`${DATA}/c2-proposals.log`, log.join("\n") + "\n")
  }
})

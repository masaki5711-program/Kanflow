/**
 * Platform eval (cycle 1): AI chat threads + proposal approve, AI report job, surveillance settings.
 * Ollama is shared with production: at most 2 AI requests are made here
 * (1 chat message, 1 progress-report job).
 */
import { test, expect, type Page } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, apiLogin, BASE, DATA, note, PILOT, shot } from "./platform-helpers"

test.describe.configure({ mode: "serial" })
test.setTimeout(900_000)

const log: string[] = []
let storage: Awaited<ReturnType<Awaited<ReturnType<typeof apiLogin>>["storageState"]>>
let threadId = ""

test.beforeAll(async () => {
  const email = fs.readFileSync(`${DATA}/platform-ui-user.txt`, "utf8").split(" ")[0]
  const api = await apiLogin(email)
  await api.patch("/api/user/language", { data: { language: "ja" } })
  storage = await api.storageState()
})

async function open(browser: import("@playwright/test").Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE, storageState: storage })
  return ctx.newPage()
}

const AI_MARK = `${DATA}/platform-ai-budget.txt`
function spend(what: string): boolean {
  const used = fs.existsSync(AI_MARK) ? fs.readFileSync(AI_MARK, "utf8").split(/\r?\n/).filter(Boolean) : []
  if (used.includes(what) || used.length >= 3) return false
  fs.appendFileSync(AI_MARK, `${what}\n`)
  return true
}

test("chat: ask for a PBI proposal (AI #1), approve creates a PBI", async ({ browser }) => {
  test.skip(!spend("chat"), "AI budget: chat request already spent")
  const page = await open(browser)
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/projects/${PILOT}/chat`)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.screenshot({ path: shot("chat-empty") })
  const before = await (await page.request.get(`/api/projects/${PILOT}/backlog`)).json()
  const countBefore = JSON.stringify(before).match(/"displayId"/g)?.length ?? 0

  const input = page.getByRole("textbox", { name: /メッセージ入力|Message|Pesan/ })
  await input.fill("このプロジェクトに PBI を 1 件提案して")
  const t0 = Date.now()
  await page.getByRole("button", { name: /^(送信|Send|Kirim)$/ }).click()
  // URL gets ?thread=<id> once the thread is created
  await expect.poll(() => new URL(page.url()).searchParams.get("thread"), { timeout: 60_000 }).not.toBeNull()
  threadId = new URL(page.url()).searchParams.get("thread") ?? ""
  fs.writeFileSync(`${DATA}/platform-ai-thread.txt`, threadId)
  log.push(`chat: thread created ${threadId} after ${Date.now() - t0} ms`)
  const approve = page.getByRole("button", { name: /承認して作成|Approve and create|Setujui/ })
  const done = await approve.first().waitFor({ timeout: 600_000 }).then(() => true).catch(() => false)
  log.push(`chat: proposal card visible=${done} after ${Math.round((Date.now() - t0) / 1000)} s`)
  await page.screenshot({ path: shot("chat-proposal"), fullPage: true })
  if (!done) {
    log.push(`chat: last assistant text: ${(await page.locator("main").innerText()).slice(-600).replace(/\s+/g, " ")}`)
    expect(done).toBe(true)
  }
  const create = page.waitForResponse((r) => r.url().includes(`/api/projects/${PILOT}/backlog`) && r.request().method() === "POST", { timeout: 60_000 })
  await approve.first().click()
  const res = await create
  const pbi = await res.json()
  log.push(`chat: approve -> POST backlog ${res.status()} displayId=${pbi.displayId} story="${String(pbi.userStory ?? "").slice(0, 80)}"`)
  expect(res.status()).toBe(201)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: shot("chat-proposal-approved"), fullPage: true })
  const after = await (await page.request.get(`/api/projects/${PILOT}/backlog`)).json()
  const countAfter = JSON.stringify(after).match(/"displayId"/g)?.length ?? 0
  log.push(`chat: backlog displayId count ${countBefore} -> ${countAfter}; page errors: ${errors.join(" / ") || "none"}`)
  // Cleanup the created PBI (soft delete -> trash)
  if (pbi.id) log.push(`chat: cleanup PBI -> ${(await page.request.delete(`/api/projects/${PILOT}/backlog/${pbi.id}`)).status()}`)
  await page.context().close()
})

test("chat threads: resume (?thread=), rename, private to owner, delete", async ({ browser }) => {
  // Cycle 2: the cycle-1 thread belongs to the cycle-1 throwaway user; resume / duplicate / rename /
  // delete are covered by platform-c2-proposals.spec.ts with that user re-activated.
  test.skip(true, "superseded by platform-c2-proposals.spec.ts")
  if (!threadId && fs.existsSync(`${DATA}/platform-ai-thread.txt`)) threadId = fs.readFileSync(`${DATA}/platform-ai-thread.txt`, "utf8").trim()
  expect(threadId).not.toBe("")
  const page = await open(browser)
  await page.goto(`/projects/${PILOT}/chat?thread=${threadId}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  const bubbles = await page.getByText("このプロジェクトに PBI を 1 件提案して").count()
  log.push(`threads: resume via ?thread= shows the question: ${bubbles > 0}`)
  expect(bubbles).toBeGreaterThan(0)
  await page.screenshot({ path: shot("chat-thread-resumed"), fullPage: true })

  // Other users cannot see it (admin e2e-admin included)
  const admin = await apiFor("admin")
  const cross = await admin.get(`/api/projects/${PILOT}/chat/threads/${threadId}`)
  log.push(`threads: e2e-admin GET other's thread -> ${cross.status()}`)
  expect(cross.status()).toBe(404)
  const crossDel = await admin.delete(`/api/projects/${PILOT}/chat/threads/${threadId}`)
  expect(crossDel.status()).toBe(404)

  // Resumed thread: is the already-approved proposal still actionable? (duplicate risk)
  const approveAgain = page.getByRole("button", { name: /承認して作成|Approve and create|Setujui/ }).first()
  const actionable = await approveAgain.isEnabled({ timeout: 5000 }).catch(() => false)
  const appliedBadge = await page.getByText(/反映済み|Applied|Diterapkan/).count()
  log.push(`threads: resumed proposal approve button enabled=${actionable}, applied badge count=${appliedBadge}`)
  if (actionable) {
    const dup = page.waitForResponse((r) => r.url().includes(`/api/projects/${PILOT}/backlog`) && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null)
    await approveAgain.click()
    const d = await dup
    const body = d ? await d.json().catch(() => ({})) : {}
    log.push(`threads: approving again on resumed thread -> ${d?.status()} displayId=${body.displayId} (duplicate PBI)`)
    await page.screenshot({ path: shot("chat-duplicate-approve"), fullPage: true })
    if (body.id) log.push(`threads: cleanup duplicate -> ${(await page.request.delete(`/api/projects/${PILOT}/backlog/${body.id}`)).status()}`)
  }

  // Rename via the thread list (pencil button)
  await page.getByRole("button", { name: /^(名前を変更|Rename|Ganti nama): / }).first().click({ timeout: 10_000 })
  const nameInput = page.getByRole("textbox", { name: /チャット名|Chat name|Nama/ })
  await nameInput.fill("PLAT 評価スレッド", { timeout: 10_000 })
  await nameInput.press("Enter")
  await page.waitForTimeout(1500)
  const threads = await (await page.request.get(`/api/projects/${PILOT}/chat/threads`)).json()
  const mine = (threads.items ?? []).find((x: { id: string }) => x.id === threadId)
  log.push(`threads: after rename title="${mine?.title}"`)
  expect(mine?.title).toBe("PLAT 評価スレッド")
  await page.screenshot({ path: shot("chat-thread-renamed"), fullPage: true })

  // Delete
  await page.getByRole("button", { name: /^(削除|Delete|Hapus): / }).first().click({ timeout: 10_000 })
  await page.getByRole("alertdialog").getByRole("button", { name: /^(削除|Delete|Hapus)$/ }).click({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  const gone = await page.request.get(`/api/projects/${PILOT}/chat/threads/${threadId}`)
  log.push(`threads: after delete GET -> ${gone.status()}; url=${page.url()}`)
  expect(gone.status()).toBe(404)
  await page.goto(`/projects/${PILOT}/chat?thread=${threadId}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.screenshot({ path: shot("chat-thread-deleted-open") })
  log.push(`threads: opening deleted ?thread -> ${(await page.locator("[role=alert]").allTextContents()).join(" | ")}`)
  await page.context().close()
})

test("AI report job (AI #2): chip + notification", async ({ browser }) => {
  test.skip(!spend("job"), "AI budget: job already requested")
  const page = await open(browser)
  await page.goto(`/projects/${PILOT}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  const unreadBefore = await (await page.request.get("/api/notifications/unread-count")).json()
  const jobReq = page.waitForResponse((r) => r.url().endsWith("/ai/jobs") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null)
  await page.getByRole("button", { name: /進捗レポート生成|Progress Report|Laporan Progres/ }).click()
  const jr = await jobReq
  log.push(`job: POST /ai/jobs -> ${jr?.status()} ${jr ? (await jr.text()).slice(0, 200) : "(no request)"}`)
  const chip = page.locator("[role=status]").filter({ hasText: /./ })
  await page.waitForTimeout(3000)
  log.push(`job: chip text after 3s: ${(await chip.allTextContents()).join(" | ")}`)
  await page.screenshot({ path: shot("ai-job-chip") })
  // wait up to 10 min for done
  const t0 = Date.now()
  let status = ""
  while (Date.now() - t0 < 600_000) {
    const jobs = await (await page.request.get(`/api/projects/${PILOT}/ai/jobs`)).json()
    const arr = jobs.items ?? jobs.jobs ?? jobs
    status = Array.isArray(arr) && arr.length ? arr.map((j: { status: string }) => j.status).join(",") : "none-active"
    if (status === "none-active") break
    await page.waitForTimeout(10_000)
  }
  log.push(`job: active jobs finished after ${Math.round((Date.now() - t0) / 1000)} s (last: ${status})`)
  await page.waitForTimeout(3000)
  log.push(`job: chip text at end: ${(await chip.allTextContents()).join(" | ")}`)
  await page.screenshot({ path: shot("ai-job-done") })
  const notes = await (await page.request.get("/api/notifications")).json()
  const list = notes.items ?? notes.notifications ?? notes
  const ready = (Array.isArray(list) ? list : []).filter((n: { type: string }) => n.type === "ai_report_ready")
  const unreadAfter = await (await page.request.get("/api/notifications/unread-count")).json()
  log.push(`job: ai_report_ready notifications=${ready.length}; unread ${JSON.stringify(unreadBefore)} -> ${JSON.stringify(unreadAfter)}; sample=${JSON.stringify(ready[0] ?? {}).slice(0, 250)}`)
  const reports = await (await page.request.get(`/api/projects/${PILOT}/ai-reports`)).json()
  log.push(`job: ai-reports: ${JSON.stringify(reports).slice(0, 200)}`)
  await page.getByRole("button", { name: /通知|Notifications|Notifikasi/ }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: shot("ai-job-notification") })
  await page.context().close()
})

test("surveillance settings save (PO/admin) and are read-only for dev", async ({ browser }) => {
  const page = await open(browser)
  await page.goto(`/projects/${PILOT}/settings`)
  await page.waitForLoadState("networkidle").catch(() => {})
  const section = page.getByRole("region", { name: /AI 監視|AI surveillance|Pemantauan/i })
  await section.scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: shot("surveillance-settings"), fullPage: true })
  const num = section.locator("input[type=number]").first()
  const orig = await num.inputValue()
  await num.fill(String(Number(orig) + 1))
  const save = page.waitForResponse((r) => r.url().includes("/surveillance-settings") && r.request().method() === "PUT", { timeout: 20_000 })
  await section.getByRole("button", { name: /保存|Save|Simpan/ }).first().click()
  const res = await save
  const after = await (await page.request.get(`/api/projects/${PILOT}/surveillance-settings`)).json()
  log.push(`surveillance: PUT -> ${res.status()}; stored=${JSON.stringify(after)}; toast=${(await page.locator("[role=status],[role=alert]").allTextContents()).join(" | ")}`)
  expect(res.status()).toBe(200)
  // restore original
  await num.fill(orig)
  await section.getByRole("button", { name: /保存|Save|Simpan/ }).first().click()
  await page.waitForTimeout(1500)

  // dev: controls disabled?
  const dev = await browser.newContext({ baseURL: BASE, storageState: await (await import("./platform-helpers")).storageFor("dev") })
  const dp = await dev.newPage()
  await dp.goto(`/projects/${PILOT}/settings`)
  await dp.waitForLoadState("networkidle").catch(() => {})
  const ds = dp.getByRole("region", { name: /AI 監視|AI surveillance|Pemantauan/i })
  const disabled = await ds.locator("input[type=number]").first().isDisabled({ timeout: 10_000 }).catch(() => "n/a")
  log.push(`surveillance as dev: section visible=${await ds.isVisible().catch(() => false)} input disabled=${disabled}`)
  await dp.screenshot({ path: shot("surveillance-settings-dev"), fullPage: true })
  await page.context().close()
  await dev.close()
})

test.afterAll(() => {
  fs.appendFileSync(`${DATA}/platform-ai.log`, log.join("\n") + "\n")
  note({ kind: "ai", log })
})

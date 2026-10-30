import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test"
import { WRITE_SKIP_REASON, e2ePassword, e2eUser, writeFlowsEnabled } from "../support/env"
import { loginViaUi } from "../support/login"

/**
 * Token issue (/me UI) → Kanflow MCP (`POST /api/mcp`, Bearer token only) →
 * the change shows up in the UI with the "via MCP" badge (activity
 * `meta.via = "mcp"`).
 *
 * WRITE flow: skipped unless E2E_ALLOW_WRITE=1 and E2E_USER / E2E_PASSWORD are
 * set (separate TEST database only). Needs API_TOKENS_ENABLED=on (the default)
 * and the user may hold at most API_TOKEN_MAX_PER_USER active tokens (one more is created here). It creates a
 * throw-away project "E2E MCP <run>" and a project-restricted token, and
 * removes both afterwards.
 */
test.describe.configure({ mode: "serial" })
test.skip(!writeFlowsEnabled, WRITE_SKIP_REASON)

const RUN_ID = `${Date.now()}`
const PROJECT_NAME = `E2E MCP ${RUN_ID}`
const TOKEN_NAME = `E2E MCP token ${RUN_ID}`
const TASK_NAME = `E2E MCP task ${RUN_ID}`
const COMMENT = `E2E comment via MCP ${RUN_ID}`

/** UI labels in every language (the page follows the user's language setting). */
const CREATE_TOKEN = /^(トークンを発行|Create token|Buat token)$/
const PRESET_DEVELOPER = /^(Developer 向け|For developers|Untuk developer)$/
const PROJECTS_SELECTED = /^(選んだプロジェクトだけ|Selected projects only|Hanya proyek yang dipilih)$/
const DONE_SAVED = /^(保存しました|I have saved it|Sudah saya simpan)$/

let projectId = ""
let sprintId = ""
let taskId = ""
let token = ""

async function json<T>(res: APIResponse, expectedStatus: number[]): Promise<T> {
  expect(expectedStatus, `${res.url()} -> ${res.status()} ${await res.text()}`).toContain(res.status())
  return (await res.json()) as T
}

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

let rpcId = 0

/** One JSON-RPC message per POST (stateless Streamable HTTP, JSON responses). */
async function rpc(api: APIRequestContext, method: string, params: unknown) {
  const res = await api.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    data: { jsonrpc: "2.0", id: ++rpcId, method, params },
  })
  return json<{ result?: Record<string, unknown>; error?: { code: number; message: string } }>(res, [200])
}

async function callTool(api: APIRequestContext, name: string, args: Record<string, unknown>) {
  const msg = await rpc(api, "tools/call", { name, arguments: args })
  expect(msg.error, JSON.stringify(msg.error)).toBeUndefined()
  const result = msg.result as { isError?: boolean; content: Array<{ type: string; text: string }> }
  expect(result.isError ?? false, result.content?.[0]?.text).toBe(false)
  return JSON.parse(result.content[0].text) as { data: Record<string, unknown>; replayed?: boolean }
}

test.beforeEach(async ({ page }) => {
  await loginViaUi(page, e2eUser, e2ePassword)
})

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginViaUi(page, e2eUser, e2ePassword)
    // Revoke the token by name (the list never holds the plain token).
    const list = await page.request.get("/api/user/api-tokens")
    if (list.ok()) {
      const body = (await list.json()) as { tokens: Array<{ id: string; name: string }> }
      for (const tok of body.tokens.filter((x) => x.name === TOKEN_NAME)) {
        await page.request.delete(`/api/user/api-tokens/${tok.id}`)
      }
    }
    if (projectId) await page.request.delete(`/api/projects/${projectId}`)
  } finally {
    await context.close()
  }
})

test("prepare a project with a sprint and a task (UI session)", async ({ page }) => {
  const tokens = await json<{ config: { enabled: boolean } }>(await page.request.get("/api/user/api-tokens"), [200])
  test.skip(!tokens.config.enabled, "API_TOKENS_ENABLED is off on this server")

  const project = await json<{ id: string }>(
    await page.request.post("/api/projects", { data: { name: PROJECT_NAME, description: "Created by Playwright E2E (MCP)", projectType: "software" } }),
    [200, 201],
  )
  projectId = project.id
  const pbi = await json<{ id: string }>(
    await page.request.post(`/api/projects/${projectId}/backlog`, {
      data: { initiative: `E2E MCP PBI ${RUN_ID}`, userStory: "As an E2E test I want the MCP to update my task", workloadScore: 3, status: "ready" },
    }),
    [200, 201],
  )
  const sprint = await json<{ id: string }>(
    await page.request.post(`/api/projects/${projectId}/sprints`, {
      data: { sprintName: `E2E MCP Sprint ${RUN_ID}`, startDate: isoDate(0), endDate: isoDate(13), sprintGoal: "E2E MCP", selectedPbIds: [pbi.id] },
    }),
    [200, 201],
  )
  sprintId = sprint.id
  const task = await json<{ id: string }>(
    await page.request.post(`/api/projects/${projectId}/sprints/${sprintId}/tasks`, {
      data: { pbItemId: pbi.id, taskName: TASK_NAME, estimatedHours: 2 },
    }),
    [200, 201],
  )
  taskId = task.id
})

test("issue a project-restricted Developer token on /me", async ({ page }) => {
  test.skip(!taskId, "project / task were not created")
  await page.goto("/me")
  const form = page.getByRole("form", { name: CREATE_TOKEN })
  await expect(form).toBeVisible()
  await form.getByRole("textbox").first().fill(TOKEN_NAME)
  await form.getByRole("button", { name: PRESET_DEVELOPER }).click()
  await expect(form.getByRole("checkbox", { name: /task:write/ })).toBeChecked()
  await expect(form.getByRole("checkbox", { name: /comment:write/ })).toBeChecked()
  await expect(form.getByRole("checkbox", { name: /backlog:write/ })).not.toBeChecked()
  await form.getByRole("radio", { name: PROJECTS_SELECTED }).check()
  await form.getByRole("checkbox", { name: PROJECT_NAME }).check()
  await form.getByRole("button", { name: CREATE_TOKEN }).click()

  // Shown once, in a read-only field labelled with the token name.
  const shown = page.getByRole("textbox", { name: TOKEN_NAME })
  await expect(shown).toHaveValue(/^kfl_[A-Za-z0-9_-]{43}$/)
  token = await shown.inputValue()
  await page.getByRole("button", { name: DONE_SAVED }).click()
  await expect(shown).toBeHidden()
})

test("MCP: initialize, then update the task and comment on it with the token only", async ({ playwright, baseURL }) => {
  test.skip(!token, "token was not issued")
  // A fresh context: no session cookie, only the Bearer token.
  const api = await playwright.request.newContext({ baseURL })
  try {
    const init = await rpc(api, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "kanflow-e2e", version: "1.0.0" },
    })
    expect(init.error).toBeUndefined()
    expect(init.result).toHaveProperty("serverInfo")
    expect(init.result).toHaveProperty("capabilities.tools")

    const me = await callTool(api, "whoami", {})
    expect(me.data).toMatchObject({ token: { projectIds: [projectId] } })

    const updated = await callTool(api, "update_task", { taskId, status: "in_progress", actualHours: 1 })
    expect(updated.data).toMatchObject({ id: taskId, status: "in_progress" })

    const comment = await callTool(api, "add_comment", { entityType: "sprint_task", entityId: taskId, projectId, body: COMMENT })
    expect(comment.replayed ?? false).toBe(false)

    // The Developer preset cannot create PBIs: the scope is missing and named.
    const denied = await rpc(api, "tools/call", { name: "create_pbi", arguments: { projectId, initiative: "nope", userStory: "nope" } })
    const deniedResult = denied.result as { isError?: boolean; content: Array<{ text: string }> }
    expect(deniedResult.isError).toBe(true)
    expect(JSON.parse(deniedResult.content[0].text)).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "backlog:write" })

    // Without the token: 401 before any tool runs.
    const anonymous = await api.post("/api/mcp", {
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      data: { jsonrpc: "2.0", id: ++rpcId, method: "tools/list", params: {} },
    })
    expect(anonymous.status()).toBe(401)
  } finally {
    await api.dispose()
  }
})

test("the MCP changes are in the project's activity feed with the via-MCP badge", async ({ page }) => {
  test.skip(!token, "token was not issued")
  await page.goto(`/projects/${projectId}`)
  const feed = page.getByTestId("dashboard-row-feed")
  const taskEntries = feed.getByRole("listitem").filter({ hasText: TASK_NAME })
  // created in the UI session + updated (update_task) + commented (add_comment) through the MCP.
  await expect(taskEntries).toHaveCount(3)
  const viaMcp = taskEntries.filter({ has: page.locator('[data-via="mcp"]') })
  await expect(viaMcp).toHaveCount(2)
  for (const entry of await viaMcp.all()) await expect(entry.locator('[data-via="mcp"]')).toBeVisible()
  // The creation in the UI session carries no badge.
  await expect(taskEntries.filter({ has: page.locator("[data-via]") })).toHaveCount(2)
})

import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import { loginViaUi } from "../support/login"

/**
 * Real-time updates with TWO signed-in users: A (PO) changes things through
 * the API, B (Dev, UI in Indonesian) watches the screens WITHOUT reloading.
 * Every expectation allows LIVE_MS — the SSE event + debounce + refetch.
 * Creates a task, comments and a chat message in the eval project and
 * removes them again.
 */
test.describe.configure({ mode: "serial" })

const PROJECT = "cmr8tnrzm0000m09lghm5jshr"
const BASE = `/projects/${PROJECT}`
const API = `/api/projects/${PROJECT}`
const PASSWORD = "E2e-Kanflow-2026!"
/** "Immediately": SSE delivery + client debounce + refetch, with margin for the dev server. */
const LIVE_MS = 3_000
const RUN = `rt-${Date.now().toString(36)}`

interface Task {
  id: string
  taskName: string | null
  pbItem: { id: string }
}
interface Sprint {
  id: string
  status: string
  items: Task[]
}

let a: Page
let b: Page
let sprintId = ""
let pbiId = ""
let taskId = ""
const cleanup: { url: string }[] = []

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await loginViaUi(page, email, PASSWORD)
  return page
}

/** Navigate and wait until the page's real-time stream is open. */
async function gotoLive(page: Page, url: string): Promise<void> {
  const stream = page.waitForResponse((r) => r.url().includes("/api/realtime") && r.status() === 200, { timeout: 60_000 })
  await page.goto(url)
  await stream
}

async function json<T>(req: APIRequestContext, method: "get" | "post" | "patch", url: string, data?: unknown): Promise<T> {
  const res = await req[method](url, data === undefined ? undefined : { data })
  expect(res.ok(), `${method.toUpperCase()} ${url} → ${res.status()} ${await res.text()}`).toBe(true)
  return (await res.json()) as T
}

/** Time of A's write and from its response to B seeing it (logged for the report). */
async function timed(label: string, write: () => Promise<unknown>, seen: () => Promise<void>): Promise<void> {
  const start = Date.now()
  await write()
  const written = Date.now()
  await seen()
  console.log(`[realtime] ${label}: write ${written - start} ms, then visible after ${Date.now() - written} ms`)
}

test.beforeAll(async ({ browser }) => {
  a = await signedIn(browser, "e2e-po@example.test")
  b = await signedIn(browser, "e2e-dev@example.test")
  const sprints = await json<Sprint[]>(a.request, "get", `${API}/sprints`)
  const sprint = sprints.find((s) => (s.status === "active" || s.status === "planning") && s.items.length > 0)
  test.skip(!sprint, "needs an active / planning sprint with a PBI in the eval project")
  sprintId = sprint!.id
  pbiId = sprint!.items[0].pbItem.id
})

test.afterAll(async () => {
  for (const { url } of cleanup.reverse()) await a.request.delete(url).catch(() => undefined)
  await a?.context().close()
  await b?.context().close()
})

test("A creates a task and changes its status → B's sprint board updates without a reload", async () => {
  await gotoLive(b, `${BASE}/sprints`)
  const name = `${RUN} live task`
  await timed(
    "new task on the board",
    async () => {
      const task = await json<Task>(a.request, "post", `${API}/sprints/${sprintId}/tasks`, { pbItemId: pbiId, taskName: name })
      taskId = task.id
      cleanup.push({ url: `${API}/sprints/${sprintId}/tasks/${taskId}` })
    },
    () => expect(b.getByText(name, { exact: true }).first()).toBeVisible({ timeout: LIVE_MS }),
  )

  const statusButton = b.getByRole("button", { name: new RegExp(`^${name} — `) }).first()
  const before = await statusButton.getAttribute("aria-label")
  await timed(
    "task status change",
    () => json(a.request, "patch", `${API}/sprints/${sprintId}/tasks/${taskId}`, { status: "in_progress" }),
    () => expect(statusButton).not.toHaveAttribute("aria-label", before ?? "", { timeout: LIVE_MS }),
  )
  await b.screenshot({ path: "test-results/realtime-board.png" })
})

test("A comments on the task → B's open comment thread shows it without a reload", async () => {
  await gotoLive(b, `${BASE}/sprints?task=${taskId}&tab=comments`)
  const dialog = b.getByRole("dialog")
  await expect(dialog).toBeVisible()
  const body = `${RUN} comment from A`
  await timed(
    "comment in the open thread",
    async () => {
      const c = await json<{ id: string }>(a.request, "post", `${API}/comments`, { entityType: "sprint_task", entityId: taskId, body })
      cleanup.push({ url: `${API}/comments/${c.id}` })
    },
    () => expect(dialog.getByText(body)).toBeVisible({ timeout: LIVE_MS }),
  )
})

test("A posts in the team chat → B's open chat shows it within ~2 s", async () => {
  await gotoLive(b, `${BASE}/talk`)
  const body = `${RUN} chat hello`
  await timed(
    "team chat message",
    async () => {
      const res = await a.request.post(`${API}/talk/messages`, { multipart: { body } })
      expect(res.ok(), await res.text()).toBe(true)
      const m = (await res.json()) as { id: string }
      cleanup.push({ url: `${API}/talk/messages/${m.id}` })
    },
    () => expect(b.getByText(body).first()).toBeVisible({ timeout: LIVE_MS }),
  )
  await b.screenshot({ path: "test-results/realtime-chat.png" })
})

test("A mentions B → B's notification bell count goes up without a reload", async () => {
  const session = await json<{ user: { id: string } }>(b.request, "get", "/api/auth/session")
  const members = await json<{ userId: string; user: { name: string } }[]>(a.request, "get", `${API}/members`)
  const me = members.find((m) => m.userId === session.user.id)
  test.skip(!me, "B must be a member of the project")
  await gotoLive(b, `${BASE}/sprints`)
  const badge = b.getByTestId("notification-badge")
  const unread = async () => (await json<{ unreadCount: number }>(b.request, "get", "/api/notifications/unread-count")).unreadCount
  const before = await unread()
  await timed(
    "notification bell",
    async () => {
      const c = await json<{ id: string }>(a.request, "post", `${API}/comments`, { entityType: "pbi", entityId: pbiId, body: `@[${me!.user.name}] ${RUN} please look` })
      cleanup.push({ url: `${API}/comments/${c.id}` })
    },
    () => expect(badge).toHaveText(before + 1 > 99 ? "99+" : String(before + 1), { timeout: LIVE_MS }),
  )
  expect(await unread()).toBe(before + 1)
})

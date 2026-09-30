import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test"
import { WRITE_SKIP_REASON, e2ePassword, e2eUser, writeFlowsEnabled } from "../support/env"
import { loginViaUi } from "../support/login"

/**
 * Authenticated WRITE flows. Skipped unless E2E_ALLOW_WRITE=1 and
 * E2E_USER / E2E_PASSWORD are set. They create a throw-away project (name
 * prefixed "E2E ") and delete it afterwards — but still: run them ONLY
 * against a separate test database, never the shared/production one.
 */
test.describe.configure({ mode: "serial" })
test.skip(!writeFlowsEnabled, WRITE_SKIP_REASON)

const RUN_ID = `${Date.now()}`
const PROJECT_NAME = `E2E ${RUN_ID}`

let projectId = ""
const pbiIds: string[] = []

async function json<T>(res: APIResponse, expectedStatus: number[]): Promise<T> {
  expect(expectedStatus, `${res.url()} -> ${res.status()} ${await res.text()}`).toContain(res.status())
  return (await res.json()) as T
}

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function createPbi(request: APIRequestContext, initiative: string): Promise<string> {
  const item = await json<{ id: string }>(
    await request.post(`/api/projects/${projectId}/backlog`, {
      data: { initiative, userStory: `As an E2E test I want ${initiative}`, workloadScore: 3, status: "ready" },
    }),
    [200, 201],
  )
  return item.id
}

test.beforeEach(async ({ page }) => {
  await loginViaUi(page, e2eUser, e2ePassword)
})

test.afterAll(async ({ browser }) => {
  if (!projectId) return
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginViaUi(page, e2eUser, e2ePassword)
    await page.request.delete(`/api/projects/${projectId}`)
  } finally {
    await context.close()
  }
})

test("create a project", async ({ page }) => {
  const project = await json<{ id: string; name: string }>(
    await page.request.post("/api/projects", {
      data: { name: PROJECT_NAME, description: "Created by Playwright E2E", projectType: "software" },
    }),
    [200, 201],
  )
  projectId = project.id
  expect(project.name).toBe(PROJECT_NAME)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible()
})

test("create PBIs and see them on the backlog page", async ({ page }) => {
  test.skip(!projectId, "project was not created")
  pbiIds.push(await createPbi(page.request, `E2E PBI A ${RUN_ID}`))
  pbiIds.push(await createPbi(page.request, `E2E PBI B ${RUN_ID}`))

  await page.goto(`/projects/${projectId}/backlog`)
  await expect(page.getByRole("heading", { name: `E2E PBI A ${RUN_ID}` })).toBeVisible()
  await expect(page.getByRole("heading", { name: `E2E PBI B ${RUN_ID}` })).toBeVisible()
})

test("reorder the backlog", async ({ page }) => {
  test.skip(pbiIds.length < 2, "PBIs were not created")
  const reversed = [...pbiIds].reverse()
  await json(
    await page.request.put(`/api/projects/${projectId}/backlog/reorder`, { data: { orderedIds: reversed } }),
    [200],
  )

  const list = await json<{ readyItems: Array<{ id: string }> }>(
    await page.request.get(`/api/projects/${projectId}/backlog`),
    [200],
  )
  const order = list.readyItems.map((i) => i.id).filter((id) => pbiIds.includes(id))
  expect(order).toEqual(reversed)
})

test("create a sprint with a PBI and add a task", async ({ page }) => {
  test.skip(pbiIds.length < 1, "PBIs were not created")
  const sprint = await json<{ id: string }>(
    await page.request.post(`/api/projects/${projectId}/sprints`, {
      data: {
        sprintName: `E2E Sprint ${RUN_ID}`,
        startDate: isoDate(0),
        endDate: isoDate(13),
        sprintGoal: "E2E goal",
        selectedPbIds: [pbiIds[0]],
      },
    }),
    [200, 201],
  )

  const task = await json<{ id: string; taskName: string }>(
    await page.request.post(`/api/projects/${projectId}/sprints/${sprint.id}/tasks`, {
      data: { pbItemId: pbiIds[0], taskName: `E2E Task ${RUN_ID}`, estimatedHours: 2 },
    }),
    [200, 201],
  )
  expect(task.taskName).toBe(`E2E Task ${RUN_ID}`)
})

test("confirm dialog is fully keyboard operable (Escape cancels, focus returns)", async ({ page }) => {
  test.skip(pbiIds.length < 2, "PBIs were not created")
  await page.goto(`/projects/${projectId}/backlog`)

  const heading = page.getByRole("heading", { name: `E2E PBI B ${RUN_ID}` })
  await expect(heading).toBeVisible()
  const card = heading.locator("xpath=ancestor::*[.//button[@aria-label]][1]")
  const deleteButton = card.getByRole("button", { name: /^(削除|Delete|Hapus)$/ })

  // Open with the keyboard.
  await deleteButton.focus()
  await page.keyboard.press("Enter")

  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()
  // Initial focus lands on the safe action (Cancel), not the destructive one.
  await expect(dialog.getByRole("button", { name: /^(キャンセル|Cancel|Batal)$/ })).toBeFocused()

  // Focus is trapped inside the dialog.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab")
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true)
  }

  // Escape cancels and returns focus to the trigger; the PBI is still there.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(deleteButton).toBeFocused()
  await expect(heading).toBeVisible()
})

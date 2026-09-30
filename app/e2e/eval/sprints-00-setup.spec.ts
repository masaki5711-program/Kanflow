import { expect, test } from "@playwright/test"
import { USERS, api, newUserPage, stamp, writeState } from "./sprints-support"

/** Creates an isolated project "E2E-Sprints-C1-<stamp>" with SM/Dev members and 4 READY PBIs. */
test("setup: project, members, ready PBIs", async ({ browser }) => {
  const { ctx, page } = await newUserPage(browser, "po")
  const projectName = `E2E-Sprints-C1-${stamp()}`
  const proj = await api<{ id: string }>(page, "POST", "/api/projects", {
    name: projectName, description: "E2E sprints evaluation (cycle 1). ".repeat(12), projectType: "software",
  })
  expect(proj.status, JSON.stringify(proj.body)).toBe(201)
  const projectId = proj.body.id

  for (const [role, r] of [["sm", "sm"], ["dev", "dev"]] as const) {
    const m = await api(page, "POST", `/api/projects/${projectId}/members`, { userId: USERS[role].id, role: r })
    expect([200, 201], JSON.stringify(m.body)).toContain(m.status)
  }

  const pbiIds: string[] = []
  for (const [i, score] of [[1, 3], [2, 5], [3, 2], [4, 8]] as const) {
    const r = await api<{ id: string }>(page, "POST", `/api/projects/${projectId}/backlog`, {
      initiative: `E2E-PBI-${i} board target`, userStory: `As an E2E tester I want PBI ${i}`, workloadScore: score, status: "ready",
    })
    expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
    pbiIds.push(r.body.id)
  }
  writeState({ projectId, projectName, pbiIds })
  console.log(`project ${projectId} ${projectName}`)
  await ctx.close()
})

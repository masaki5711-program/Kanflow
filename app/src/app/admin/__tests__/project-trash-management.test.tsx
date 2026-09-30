import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { ProjectTrashManagement, type AdminProjectTrash } from "../trash/project-trash-management"

const URL_BASE = "/api/admin/trash/projects"
const t = tr("ja")

function list(): AdminProjectTrash {
  return {
    retentionDays: 30,
    projects: [
      {
        id: "p9",
        name: "旧プロジェクト",
        status: "active",
        deletedAt: "2026-10-01T00:00:00.000Z",
        deletedBy: { id: "u1", name: "Alice" },
        purgeAt: "2026-10-31T00:00:00.000Z",
        counts: { backlogItems: 4, iceboxItems: 2, sprints: 1 },
        i18n: {},
      },
    ],
  }
}

function setup(opts: { empty?: boolean; restoreStatus?: number } = {}) {
  return stubFetch([
    { match: URL_BASE, method: "GET", respond: () => jsonResponse(opts.empty ? { retentionDays: 30, projects: [] } : list()) },
    {
      match: /\/trash\/projects\/p9\/restore$/,
      method: "POST",
      respond: () => jsonResponse(opts.restoreStatus ? { error: "x" } : { success: true }, opts.restoreStatus ?? 200),
    },
    { match: /\/trash\/projects\/p9$/, method: "DELETE", respond: () => jsonResponse({ success: true }) },
  ])
}

const calls = (fetchMock: ReturnType<typeof stubFetch>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === method).map(([u]) => String(u))

describe("ProjectTrashManagement", () => {
  it("lists trashed projects with counts and who deleted them", async () => {
    setup()
    renderWithProviders(<ProjectTrashManagement />)
    const row = within(await screen.findByRole("list", { name: t.trashAdminTitle })).getByRole("listitem")
    expect(row).toHaveTextContent("旧プロジェクト")
    expect(row).toHaveTextContent(t.trashAdminCounts.replace("{pbi}", "4").replace("{icebox}", "2").replace("{sprints}", "1"))
    expect(row).toHaveTextContent(t.trashDeletedBy.replace("{name}", "Alice"))
  })

  it("shows the empty state", async () => {
    setup({ empty: true })
    renderWithProviders(<ProjectTrashManagement />)
    expect(await screen.findByRole("heading", { name: t.trashAdminEmptyTitle })).toBeInTheDocument()
  })

  it("restores after confirmation", async () => {
    const fetchMock = setup()
    renderWithProviders(<ProjectTrashManagement />)
    await userEvent.click(await screen.findByRole("button", { name: `${t.trashRestore}: 旧プロジェクト` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.trashRestore }))
    await waitFor(() => expect(calls(fetchMock, "POST")).toEqual(["/api/admin/trash/projects/p9/restore"]))
    await waitFor(() => expect(screen.queryByText("旧プロジェクト")).not.toBeInTheDocument())
  })

  it("keeps the project listed when the restore fails", async () => {
    setup({ restoreStatus: 500 })
    renderWithProviders(<ProjectTrashManagement />)
    await userEvent.click(await screen.findByRole("button", { name: `${t.trashRestore}: 旧プロジェクト` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.trashRestore }))
    await waitFor(() => expect(screen.getByText("旧プロジェクト")).toBeInTheDocument())
  })

  it("deletes permanently only after confirmation", async () => {
    const fetchMock = setup()
    renderWithProviders(<ProjectTrashManagement />)
    await userEvent.click(await screen.findByRole("button", { name: `${t.trashDeleteForever}: 旧プロジェクト` }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.trashAdminConfirmPurgeMessage.replace("{name}", "旧プロジェクト"))
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(calls(fetchMock, "DELETE")).toEqual([])
    await userEvent.click(screen.getByRole("button", { name: `${t.trashDeleteForever}: 旧プロジェクト` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.trashDeleteForever }))
    await waitFor(() => expect(calls(fetchMock, "DELETE")).toEqual(["/api/admin/trash/projects/p9"]))
  })
})

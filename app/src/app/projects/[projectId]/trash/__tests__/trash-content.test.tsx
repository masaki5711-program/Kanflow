import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { TrashContent, type ProjectTrash } from "../trash-content"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: vi.fn() }) }))

const URL_BASE = "/api/projects/p1/trash"
const t = tr("ja")

function trash(): ProjectTrash {
  return {
    retentionDays: 14,
    items: [
      {
        entityType: "icebox_item",
        id: "i1",
        displayId: 9,
        title: "要望A",
        titleField: "request",
        status: "unreviewed",
        deletedAt: "2026-10-08T00:00:00.000Z",
        deletedBy: { id: "u1", name: "Alice" },
        purgeAt: "2026-10-22T00:00:00.000Z",
        i18n: {},
      },
      {
        entityType: "backlog_item",
        id: "b1",
        displayId: 3,
        title: "ストーリーB",
        titleField: "userStory",
        status: "ready",
        deletedAt: "2026-10-05T00:00:00.000Z",
        deletedBy: null,
        purgeAt: "2026-10-19T00:00:00.000Z",
        i18n: {},
      },
    ],
  }
}

function setup(opts: { list?: ProjectTrash; restoreStatus?: number; purgeStatus?: number } = {}) {
  return stubFetch([
    { match: URL_BASE, method: "GET", respond: () => jsonResponse(opts.list ?? trash()) },
    {
      match: /\/trash\/(backlog_item|icebox_item|plan_item)\/[a-z0-9]+\/restore$/,
      method: "POST",
      respond: () => jsonResponse(opts.restoreStatus ? { error: "nope", code: "PROJECT_IN_TRASH" } : { success: true }, opts.restoreStatus ?? 200),
    },
    {
      match: /\/trash\/(backlog_item|icebox_item)\/[a-z0-9]+$/,
      method: "DELETE",
      respond: () => jsonResponse(opts.purgeStatus ? { error: "x" } : { success: true }, opts.purgeStatus ?? 200),
    },
  ])
}

const calls = (fetchMock: ReturnType<typeof stubFetch>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === method).map(([u]) => String(u))

describe("TrashContent", () => {
  it("lists trashed items newest first with type, who, and the retention period", async () => {
    setup()
    renderWithProviders(<TrashContent projectId="p1" canPurge />)
    const list = await screen.findByRole("list", { name: t.trashListLabel })
    const rows = within(list).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("要望A")
    expect(rows[0]).toHaveTextContent(t.trashTypeIcebox)
    expect(rows[0]).toHaveTextContent(t.trashDeletedBy.replace("{name}", "Alice"))
    expect(rows[1]).toHaveTextContent(t.trashDeletedBy.replace("{name}", t.trashUnknownUser))
    expect(screen.getByText(t.trashDescription.replace("{days}", "14"))).toBeInTheDocument()
  })

  it("shows the empty state when nothing is in the trash", async () => {
    setup({ list: { retentionDays: 30, items: [] } })
    renderWithProviders(<TrashContent projectId="p1" canPurge />)
    expect(await screen.findByRole("heading", { name: t.trashEmptyTitle })).toBeInTheDocument()
  })

  it("restores an item and removes it from the list", async () => {
    const fetchMock = setup()
    renderWithProviders(<TrashContent projectId="p1" canPurge={false} />)
    await screen.findByRole("list", { name: t.trashListLabel })
    await userEvent.click(screen.getByRole("button", { name: `${t.trashRestore}: #3` }))
    await waitFor(() => expect(calls(fetchMock, "POST")).toEqual(["/api/projects/p1/trash/backlog_item/b1/restore"]))
    await waitFor(() => expect(screen.queryByText("ストーリーB")).not.toBeInTheDocument())
  })

  it("puts the item back when the restore fails", async () => {
    setup({ restoreStatus: 409 })
    renderWithProviders(<TrashContent projectId="p1" canPurge />)
    await screen.findByRole("list", { name: t.trashListLabel })
    await userEvent.click(screen.getByRole("button", { name: `${t.trashRestore}: #9` }))
    expect(await screen.findByText("要望A")).toBeInTheDocument()
  })

  it("hides 'delete permanently' without the purge permission", async () => {
    setup()
    renderWithProviders(<TrashContent projectId="p1" canPurge={false} />)
    await screen.findByRole("list", { name: t.trashListLabel })
    expect(screen.queryByRole("button", { name: new RegExp(t.trashDeleteForever) })).not.toBeInTheDocument()
  })

  it("purges only after confirmation", async () => {
    const fetchMock = setup()
    renderWithProviders(<TrashContent projectId="p1" canPurge />)
    await screen.findByRole("list", { name: t.trashListLabel })

    await userEvent.click(screen.getByRole("button", { name: `${t.trashDeleteForever}: #9` }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.trashConfirmPurgeMessage.replace("{name}", "#9 要望A"))
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(calls(fetchMock, "DELETE")).toEqual([])

    await userEvent.click(screen.getByRole("button", { name: `${t.trashDeleteForever}: #9` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.trashDeleteForever }))
    await waitFor(() => expect(calls(fetchMock, "DELETE")).toEqual(["/api/projects/p1/trash/icebox_item/i1"]))
    await waitFor(() => expect(screen.queryByText("要望A")).not.toBeInTheDocument())
  })

  it("shows a master-plan subtree without a number and restores it by title", async () => {
    const plan: ProjectTrash = {
      retentionDays: 30,
      items: [
        {
          entityType: "plan_item",
          id: "pl1",
          displayId: null,
          title: "フェーズ1",
          titleField: "name",
          status: "in_progress",
          deletedAt: "2026-10-08T00:00:00.000Z",
          deletedBy: { id: "u1", name: "Alice" },
          purgeAt: "2026-11-07T00:00:00.000Z",
          subtreeCount: 3,
          i18n: {},
        },
      ],
    }
    const fetchMock = setup({ list: plan })
    renderWithProviders(<TrashContent projectId="p1" canPurge />)
    const list = await screen.findByRole("list", { name: t.trashListLabel })
    const row = within(list).getByRole("listitem")
    expect(row).toHaveTextContent(t.trashTypePlan)
    expect(row).toHaveTextContent(t.trashPlanSubtree.replace("{count}", "3"))
    expect(row).not.toHaveTextContent("#")
    await userEvent.click(screen.getByRole("button", { name: `${t.trashRestore}: フェーズ1` }))
    await waitFor(() => expect(calls(fetchMock, "POST")).toEqual(["/api/projects/p1/trash/plan_item/pl1/restore"]))
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, stubFetch } from "../../../gantt/__tests__/providers"
import { iceboxItem } from "../../../icebox/__tests__/fixtures"
import { boardOf, improvement, renderKaizen } from "./board-fixtures"

vi.mock("next/navigation", async () => (await import("../../../backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

const { resetUrl } = await import("../../../backlog/__tests__/nav-mock")
const { default: ReleasesPage } = await import("../../page")

let posts: Array<{ url: string; body: unknown }>
let canManage = true

const ICEBOX = {
  unreviewed: [iceboxItem("i1", 1, { request: "治具を共通化したい" }), iceboxItem("i2", 2, { request: "既に取り込み済みの要望" })],
  reviewed: [],
  completed: [],
  frozen: [],
}

beforeEach(() => {
  resetUrl("/projects/p1/releases")
  posts = []
  canManage = true
  stubFetch((url, init) => {
    if (init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body)) })
      return jsonResponse({ id: "n1", created: 1, skipped: 0 }, 201)
    }
    if (url === "/api/projects/p1/improvements") return jsonResponse(boardOf([improvement({ id: "x", iceboxId: "i2" })], { canManage, canTrack: true }))
    if (url === "/api/projects/p1/icebox") return jsonResponse(ICEBOX)
    return jsonResponse({})
  })
})

describe("改善成果ボード: direct add and 改善要望 import", () => {
  it("writes an improvement straight onto the board (title required, metric optional)", async () => {
    renderKaizen(<ReleasesPage />)
    await userEvent.click(await screen.findByRole("button", { name: "改善を追加" }))
    const submit = screen.getByRole("button", { name: "追加する" })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/改善内容/), "治具の共通化")
    await userEvent.type(screen.getByLabelText("改善前"), "60")
    await userEvent.type(screen.getByLabelText("目標"), "30")
    await userEvent.click(submit)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: "/api/projects/p1/improvements", body: { title: "治具の共通化", direction: "decrease", baselineValue: 60, targetValue: 30 } })
  })

  it("lists 改善要望 not yet on the board and imports the selected ones", async () => {
    renderKaizen(<ReleasesPage />)
    await userEvent.click(await screen.findByRole("button", { name: "改善要望から取り込み" }))
    expect(await screen.findByText("治具を共通化したい")).toBeInTheDocument()
    // Already on the board → hidden.
    expect(screen.queryByText("既に取り込み済みの要望")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("checkbox"))
    await userEvent.click(screen.getByRole("button", { name: /取り込む/ }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: "/api/projects/p1/improvements/import-requests", body: { iceboxIds: ["i1"] } })
  })

  it("offers neither button to someone who cannot manage the board", async () => {
    canManage = false
    renderKaizen(<ReleasesPage />)
    await screen.findByRole("heading", { level: 1, name: "改善成果ボード" })
    expect(screen.queryByRole("button", { name: "改善を追加" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "改善要望から取り込み" })).not.toBeInTheDocument()
  })
})

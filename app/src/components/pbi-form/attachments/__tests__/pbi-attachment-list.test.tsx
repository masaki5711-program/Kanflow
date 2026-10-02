import { describe, expect, it } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { PbiReadBody, type PbiDetail } from "../../pbi-read-body"
import { screenFiles } from "../types"

const t = tr("ja")

const ITEM = {
  id: "b1",
  displayId: 3,
  initiative: "Login",
  epic: null,
  userStory: null,
  acceptanceCriteria: null,
  workloadScore: 3,
  status: "ready",
  assignedPo: null,
  completedAt: null,
  iceboxItem: null,
  productGoal: null,
  referenceDoc: "See the attached mock-up",
  notReadyReason: null,
  poNote: null,
  createdAt: "",
  updatedAt: "",
  attachments: [
    { id: "a1", fileName: "m.png", originalName: "mockup.png", fileSize: 2048, mimeType: "image/png", createdAt: "" },
    { id: "a2", fileName: "s.xlsx", originalName: "spec.xlsx", fileSize: 4096, mimeType: "application/vnd.ms-excel", createdAt: "" },
  ],
} as unknown as PbiDetail

describe("PbiReadBody — 参考資料 attachments", () => {
  it("shows image thumbnails and file links under 参考資料, without remove buttons", () => {
    renderWithProviders(<PbiReadBody item={ITEM} projectId="p1" />)
    expect(screen.getByText("See the attached mock-up")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "spec.xlsx" })).toHaveAttribute("href", "/api/projects/p1/backlog/b1/attachments/a2")
    expect(screen.getByRole("link", { name: "spec.xlsx" })).toHaveAttribute("target", "_blank")
    expect(screen.queryByRole("button", { name: t.pbiAttachDelete.replace("{name}", "mockup.png") })).not.toBeInTheDocument()
  })

  it("opens an image full-screen from its thumbnail", async () => {
    renderWithProviders(<PbiReadBody item={ITEM} projectId="p1" />)
    await userEvent.click(screen.getByRole("button", { name: t.pbiAttachPreview.replace("{name}", "mockup.png") }))
    const viewer = await screen.findByRole("dialog")
    expect(within(viewer).getByRole("img", { name: "mockup.png" })).toHaveAttribute("src", "/api/projects/p1/backlog/b1/attachments/a1")
  })
})

describe("screenFiles", () => {
  const MB = 1024 * 1024
  const sized = (name: string, size: number) => {
    const f = new File(["x"], name)
    Object.defineProperty(f, "size", { value: size })
    return f
  }

  it("refuses files over 200 MB one by one and keeps the rest", () => {
    const ok = sized("ok.txt", 10)
    const { accepted, errors } = screenFiles([ok, sized("big.mov", 200 * MB + 1)], 0, t)
    expect(accepted).toEqual([ok])
    expect(errors).toEqual([`big.mov: ${t.pbiAttachTooLarge}`])
  })

  it("drops what exceeds the per-PBI limit with one message", () => {
    const files = [sized("a.txt", 1), sized("b.txt", 1), sized("c.txt", 1)]
    const { accepted, errors } = screenFiles(files, 18, t)
    expect(accepted.map((f) => f.name)).toEqual(["a.txt", "b.txt"])
    expect(errors).toEqual([t.pbiAttachTooMany.replace("{max}", "20")])
  })
})

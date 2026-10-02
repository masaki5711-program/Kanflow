import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createEvent, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import type { PbiFormOptions } from "@/components/pbi-form/use-pbi-form-options"
import { jsonResponse, renderWithProviders, stubLayout } from "./__tests__/helpers"

vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }))

const { PbiCreateModal } = await import("./pbi-create-modal")

stubLayout()

const t = getTranslations("en")
const pt = getProjectTypeLabels("software", "en")
const OPTIONS: PbiFormOptions = { iceboxOptions: [], goals: [], pointUnit: "SP", iceboxUsage: new Map() }
const UPLOAD_URL = "/api/projects/p1/backlog/new/attachments"

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

/** fetch: the PBI create returns id "new"; uploads succeed unless the file name contains "bad". */
function stubApi() {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      calls.push({ url, method, body: init?.body })
      if (method === "POST" && url === "/api/projects/p1/backlog") return jsonResponse({ id: "new", displayId: 7 }, 201)
      if (method === "POST" && url === UPLOAD_URL) {
        const file = (init?.body as FormData).get("file") as File
        return file.name.includes("bad")
          ? jsonResponse({ error: "Unsupported file type" }, 415)
          : jsonResponse({ id: `att-${file.name}`, fileName: file.name, originalName: file.name, fileSize: file.size, mimeType: file.type, createdAt: "" }, 201)
      }
      return jsonResponse({})
    }),
  )
  return calls
}

function renderCreate() {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  renderWithProviders(<PbiCreateModal projectId="p1" onClose={onClose} onCreated={onCreated} formOptions={OPTIONS} />)
  return { onClose, onCreated, referenceDoc: screen.getByLabelText(t.backlogReferenceDoc) }
}

function paste(target: Element, files: File[]) {
  fireEvent(target, createEvent.paste(target, { clipboardData: { files, getData: () => "" } }))
}

describe("PbiCreateModal — 参考資料 attachments", () => {
  it("queues pasted / dropped files and uploads them right after the PBI is created", async () => {
    const calls = stubApi()
    const { onCreated, referenceDoc } = renderCreate()
    await userEvent.type(screen.getByLabelText(pt.backlogInitiative, { selector: "input" }), "Login")
    paste(referenceDoc, [new File(["png"], "image.png", { type: "image/png" })])
    fireEvent.drop(screen.getByRole("button", { name: t.pbiAttachDrop }), {
      dataTransfer: { types: ["Files"], files: [new File(["%PDF"], "spec.pdf", { type: "application/pdf" })] },
    })
    expect(screen.getByText("spec.pdf")).toBeInTheDocument()
    expect(screen.getAllByText(new RegExp(t.pbiAttachPendingNote))).toHaveLength(2)
    // Nothing is uploaded before the PBI exists.
    expect(calls.some((c) => c.url === UPLOAD_URL)).toBe(false)

    await userEvent.click(screen.getByRole("button", { name: t.add }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "new", displayId: 7 }))
    const uploads = calls.filter((c) => c.method === "POST" && c.url === UPLOAD_URL)
    expect(uploads.map((c) => ((c.body as FormData).get("file") as File).name)).toEqual([expect.stringMatching(/^screenshot-.*\.png$/), "spec.pdf"])
    const createIndex = calls.findIndex((c) => c.url === "/api/projects/p1/backlog")
    expect(createIndex).toBeLessThan(calls.indexOf(uploads[0]))
  })

  it("keeps the created PBI and names each file that failed to upload", async () => {
    stubApi()
    const { onCreated, referenceDoc } = renderCreate()
    await userEvent.type(screen.getByLabelText(pt.backlogInitiative, { selector: "input" }), "Login")
    paste(referenceDoc, [new File(["x"], "bad.txt", { type: "text/plain" }), new File(["y"], "ok.txt", { type: "text/plain" })])
    await userEvent.click(screen.getByRole("button", { name: t.add }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(await screen.findByText(new RegExp(`bad\\.txt \\(Unsupported file type\\)`))).toBeInTheDocument()
  })

  it("counts queued files as unsaved input and lets one be removed before saving", async () => {
    stubApi()
    const { referenceDoc } = renderCreate()
    paste(referenceDoc, [new File(["x"], "notes.txt", { type: "text/plain" })])
    await userEvent.click(screen.getByRole("button", { name: t.pbiAttachRemove.replace("{name}", "notes.txt") }))
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument()
  })

  it("refuses a file over 200 MB with a message instead of queueing it", () => {
    stubApi()
    const { referenceDoc } = renderCreate()
    const huge = new File(["x"], "huge.zip", { type: "application/zip" })
    Object.defineProperty(huge, "size", { value: 201 * 1024 * 1024 })
    paste(referenceDoc, [huge])
    expect(screen.getByText(`huge.zip: ${t.pbiAttachTooLarge}`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(t.pbiAttachPendingNote))).not.toBeInTheDocument()
  })
})

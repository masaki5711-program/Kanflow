import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { LanguageProvider } from "@/lib/language-context"
import { ToastProvider } from "@/components/ui/toast"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { jsonResponse, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { Attachment, Folder } from "../types"

vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }))

const { useAttachments } = await import("../use-attachments")
const t = tr("ja")
const BASE = "/api/projects/p1"

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="ja">
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

const att = (id: string, folderId: string | null = null): Attachment => ({
  id, originalName: `${id}.pdf`, fileName: `${id}.pdf`, fileSize: 10, mimeType: "application/pdf", folderId, createdAt: "2026-01-01T00:00:00Z",
})
const fold = (id: string, parentId: string | null, sortOrder: number, attachments: Attachment[] = []): Folder => ({ id, name: id, parentId, sortOrder, attachments })

function setup(folders: Folder[] = [], attachments: Attachment[] = []) {
  return renderHook(() => useAttachments("p1", folders, attachments), { wrapper })
}

const ok = () => jsonResponse({})
const fail = (msg = "server down") => jsonResponse({ error: msg }, 500)

async function answerConfirm(label: string) {
  const dialog = await screen.findByRole("alertdialog")
  await userEvent.click(within(dialog).getByRole("button", { name: label }))
}

describe("useAttachments", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("uploads files one by one and prepends them to the target list", async () => {
    const fetchMock = stubFetch([
      { match: `${BASE}/attachments`, method: "POST", respond: async (_u, init) => {
        const fd = init?.body as FormData
        const name = (fd.get("file") as File).name
        return jsonResponse(att(name.replace(/\.\w+$/, ""), (fd.get("folderId") as string) ?? null))
      } },
    ])
    const { result } = setup([fold("f1", null, 0, [att("old", "f1")])], [])
    await act(() => result.current.uploadFiles([new File(["a"], "n1.txt"), new File(["b"], "n2.png", { type: "image/png" })], "f1"))
    expect(result.current.folders[0].attachments.map((a) => a.id)).toEqual(["n2", "n1", "old"])
    expect(result.current.uploadTarget).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(() => result.current.uploadFiles([], null))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(() => result.current.uploadFiles([new File(["c"], "n3.txt")], null))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["n3"])
  })

  it("shows an error toast when upload fails", async () => {
    stubFetch([{ match: `${BASE}/attachments`, method: "POST", respond: () => fail("too big") }])
    const { result } = setup()
    await act(() => result.current.uploadFiles([new File(["a"], "x.txt")], null))
    expect(await screen.findByText("too big")).toBeInTheDocument()
    expect(screen.getByText(t.dashboardUploadFailed)).toBeInTheDocument()
    expect(result.current.attachments).toEqual([])
  })

  it("asks for confirmation before deleting a file and does nothing when cancelled", async () => {
    const fetchMock = stubFetch([{ match: `${BASE}/attachments/a1`, method: "DELETE", respond: ok }])
    const { result } = setup([], [att("a1"), att("a2")])
    let pending!: Promise<void>
    act(() => { pending = result.current.deleteAttachment("a1", null) })
    expect(await screen.findByText(t.dashboardDeleteAttachmentConfirm)).toBeInTheDocument()
    await answerConfirm(t.cancel)
    await act(() => pending)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.attachments).toHaveLength(2)

    act(() => { pending = result.current.deleteAttachment("a1", null) })
    await answerConfirm(t.delete)
    await act(() => pending)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.attachments.map((a) => a.id)).toEqual(["a2"])
  })

  it("rolls back a failed delete inside a folder and toasts", async () => {
    stubFetch([{ match: `${BASE}/attachments/a1`, method: "DELETE", respond: () => fail() }])
    const { result } = setup([fold("f1", null, 0, [att("a1", "f1")])])
    let pending!: Promise<void>
    act(() => { pending = result.current.deleteAttachment("a1", "f1") })
    await answerConfirm(t.delete)
    await act(() => pending)
    expect(result.current.folders[0].attachments.map((a) => a.id)).toEqual(["a1"])
    expect(await screen.findByText(t.dashboardDeleteFailed)).toBeInTheDocument()
  })

  it("moves a file across folders (prepend) and persists folderId", async () => {
    const fetchMock = stubFetch([{ match: /attachments\/a1$/, method: "PATCH", respond: ok }])
    const { result } = setup([fold("f1", null, 0, [att("b", "f1")])], [att("a1")])
    await act(() => result.current.placeAttachment("a1", null, "f1"))
    expect(result.current.attachments).toEqual([])
    expect(result.current.folders[0].attachments.map((a) => a.id)).toEqual(["a1", "b"])
    expect(result.current.folders[0].attachments[0].folderId).toBe("f1")
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ folderId: "f1" })
  })

  it("inserts before a row / at the end and persists the whole order", async () => {
    const fetchMock = stubFetch([{ match: /attachments\/\w+$/, method: "PATCH", respond: ok }])
    const { result } = setup([], [att("a"), att("b"), att("c")])
    await act(() => result.current.placeAttachment("c", null, null, "a"))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["c", "a", "b"])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await act(() => result.current.placeAttachment("c", null, null, null))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["a", "b", "c"])
    // No-ops: unknown file / drop onto itself.
    fetchMock.mockClear()
    await act(() => result.current.placeAttachment("zzz", null, null, "a"))
    await act(() => result.current.placeAttachment("a", null, null, "a"))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rolls back a failed move and shows the move-failed toast", async () => {
    stubFetch([{ match: /attachments\/a1$/, method: "PATCH", respond: () => fail() }])
    const { result } = setup([fold("f1", null, 0)], [att("a1")])
    await act(() => result.current.placeAttachment("a1", null, "f1"))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["a1"])
    expect(result.current.folders[0].attachments).toEqual([])
    expect(await screen.findByText(t.dashboardMoveFailed)).toBeInTheDocument()
  })

  it("keyboard reorder swaps neighbours, ignores edges and rolls back on failure", async () => {
    let failNext = false
    stubFetch([{ match: /attachments\/\w+$/, method: "PATCH", respond: () => (failNext ? fail() : ok()) }])
    const { result } = setup([], [att("a"), att("b"), att("c")])
    await act(() => result.current.moveAttachmentBy("b", null, -1))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["b", "a", "c"])
    await act(() => result.current.moveAttachmentBy("b", null, -1))
    await act(() => result.current.moveAttachmentBy("c", null, 1))
    await act(() => result.current.moveAttachmentBy("nope", null, 1))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["b", "a", "c"])
    failNext = true
    await act(() => result.current.moveAttachmentBy("a", null, 1))
    expect(result.current.attachments.map((a) => a.id)).toEqual(["b", "a", "c"])
  })

  it("creates, renames (with rollback) and deletes folders", async () => {
    let renameFails = false
    stubFetch([
      { match: `${BASE}/folders`, method: "POST", respond: () => jsonResponse({ id: "f9", name: "New", parentId: null }) },
      { match: /folders\/f1$/, method: "PATCH", respond: () => (renameFails ? fail() : ok()) },
      { match: /folders\/f1$/, method: "DELETE", respond: ok },
    ])
    const { result } = setup([fold("f1", null, 0, [att("x", "f1")])], [att("y")])
    let created: Folder | null = null
    await act(async () => { created = await result.current.createFolder("New", null) })
    expect(created).toMatchObject({ id: "f9" })
    expect(result.current.folders.find((f) => f.id === "f9")?.attachments).toEqual([])

    await act(() => result.current.renameFolder("f1", "Renamed"))
    expect(result.current.folders[0].name).toBe("Renamed")
    renameFails = true
    await act(() => result.current.renameFolder("f1", "Broken"))
    expect(result.current.folders[0].name).toBe("Renamed")

    let pending!: Promise<void>
    act(() => { pending = result.current.deleteFolder("f1") })
    expect(await screen.findByText(t.folderDeleteConfirm)).toBeInTheDocument()
    await answerConfirm(t.delete)
    await act(() => pending)
    expect(result.current.folders.map((f) => f.id)).toEqual(["f9"])
    // Files of the deleted folder move to unfiled.
    expect(result.current.attachments.map((a) => `${a.id}:${a.folderId}`)).toEqual(["x:null", "y:null"])
  })

  it("reports folder create / delete failures", async () => {
    stubFetch([
      { match: `${BASE}/folders`, method: "POST", respond: () => fail("dup") },
      { match: /folders\/f1$/, method: "DELETE", respond: () => fail("locked") },
    ])
    const { result } = setup([fold("f1", null, 0)])
    let created: Folder | null = fold("sentinel", null, 0)
    await act(async () => { created = await result.current.createFolder("x", null) })
    expect(created).toBeNull()
    expect(await screen.findByText("dup")).toBeInTheDocument()

    let pending!: Promise<void>
    act(() => { pending = result.current.deleteFolder("f1") })
    await answerConfirm(t.delete)
    await act(() => pending)
    expect(result.current.folders).toHaveLength(1)
    expect(await screen.findByText("locked")).toBeInTheDocument()
  })

  it("cancelling folder delete keeps it", async () => {
    const fetchMock = stubFetch([])
    const { result } = setup([fold("f1", null, 0)])
    let pending!: Promise<void>
    act(() => { pending = result.current.deleteFolder("f1") })
    await answerConfirm(t.cancel)
    await act(() => pending)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.folders).toHaveLength(1)
  })

  it("placeFolder reparents, reorders siblings and refuses cycles", async () => {
    const fetchMock = stubFetch([{ match: /folders\/\w+$/, method: "PATCH", respond: ok }])
    const { result } = setup([fold("a", null, 0), fold("b", null, 1), fold("c", "a", 0)])
    await act(() => result.current.placeFolder("a", "c", 0))
    expect(fetchMock).not.toHaveBeenCalled()
    await act(() => result.current.placeFolder("missing", null, 0))
    expect(fetchMock).not.toHaveBeenCalled()

    await act(() => result.current.placeFolder("b", "a", Number.POSITIVE_INFINITY))
    const b = result.current.folders.find((f) => f.id === "b")!
    expect(b.parentId).toBe("a")
    expect(b.sortOrder).toBe(1)
    const bodies = fetchMock.mock.calls.map((c) => `${c[0]} ${c[1]!.body}`)
    expect(bodies[0]).toBe(`${BASE}/folders/b {"parentId":"a"}`)
    expect(bodies).toContain(`${BASE}/folders/c {"sortOrder":0}`)
    expect(bodies).toContain(`${BASE}/folders/b {"sortOrder":1}`)
  })

  it("placeFolder rolls back on failure", async () => {
    stubFetch([{ match: /folders\/\w+$/, method: "PATCH", respond: () => fail() }])
    const { result } = setup([fold("a", null, 0), fold("b", null, 1)])
    await act(() => result.current.placeFolder("b", "a", 0))
    expect(result.current.folders.find((f) => f.id === "b")?.parentId).toBeNull()
    expect(await screen.findByText(t.dashboardMoveFailed)).toBeInTheDocument()
  })

  it("dropFolder handles before / after / nest and ignores invalid targets", async () => {
    stubFetch([{ match: /folders\/\w+$/, method: "PATCH", respond: ok }])
    const { result } = setup([fold("a", null, 0), fold("b", null, 1), fold("c", null, 2)])
    const order = () => [...result.current.folders].filter((f) => !f.parentId).sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0)).map((f) => f.id)

    await act(() => result.current.dropFolder("c", "a", "before"))
    expect(order()).toEqual(["c", "a", "b"])
    await act(() => result.current.dropFolder("c", "b", "after"))
    expect(order()).toEqual(["a", "b", "c"])
    await act(() => result.current.dropFolder("c", "a", "nest"))
    expect(result.current.folders.find((f) => f.id === "c")?.parentId).toBe("a")
    await act(() => result.current.dropFolder("a", "a", "nest"))
    await act(() => result.current.dropFolder("a", "missing", "nest"))
    expect(result.current.folders.find((f) => f.id === "a")?.parentId).toBeNull()
  })

  it("moveFolderBy moves among siblings and ignores edges", async () => {
    stubFetch([{ match: /folders\/\w+$/, method: "PATCH", respond: ok }])
    const { result } = setup([fold("a", null, 0), fold("b", null, 1)])
    await act(() => result.current.moveFolderBy("b", -1))
    await waitFor(() => expect(result.current.folders.find((f) => f.id === "b")?.sortOrder).toBe(0))
    await act(() => result.current.moveFolderBy("b", -1))
    await act(() => result.current.moveFolderBy("missing", 1))
    expect(result.current.folders.find((f) => f.id === "a")?.sortOrder).toBe(1)
  })
})

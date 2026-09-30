import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { DragEvent } from "react"
import {
  MIME_FILE,
  MIME_FOLDER,
  ZONE_PAGE,
  ZONE_UNFILED,
  hasType,
  readFilePayload,
  useAttachmentDnd,
} from "../use-attachment-dnd"
import { useFolderDnd } from "../use-folder-dnd"
import type { AttachmentsApi } from "../use-attachments"

interface FakeOpts {
  types?: string[]
  data?: Record<string, string>
  files?: File[]
  clientY?: number
  rect?: { top: number; height: number }
  contains?: boolean
}

function fakeDrag({ types = [], data = {}, files = [], clientY = 0, rect = { top: 0, height: 100 }, contains = false }: FakeOpts = {}) {
  const store: Record<string, string> = { ...data }
  const e = {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientY,
    relatedTarget: null,
    currentTarget: { getBoundingClientRect: () => rect, contains: () => contains },
    dataTransfer: {
      types,
      files,
      effectAllowed: "",
      dropEffect: "",
      getData: (k: string) => store[k] ?? "",
      setData: vi.fn((k: string, v: string) => { store[k] = v }),
    },
  }
  return e as unknown as DragEvent & { preventDefault: ReturnType<typeof vi.fn>; stopPropagation: ReturnType<typeof vi.fn> }
}

function fakeApi() {
  return {
    placeAttachment: vi.fn(async () => {}),
    uploadFiles: vi.fn(async () => {}),
    placeFolder: vi.fn(async () => {}),
    dropFolder: vi.fn(async () => {}),
  } as unknown as AttachmentsApi & Record<"placeAttachment" | "uploadFiles" | "placeFolder" | "dropFolder", ReturnType<typeof vi.fn>>
}

const filePayload = (fileId: string, sourceFolderId: string | null) =>
  ({ [MIME_FILE]: JSON.stringify({ fileId, sourceFolderId }) })

describe("drag payload helpers", () => {
  it("hasType checks dataTransfer.types", () => {
    expect(hasType(fakeDrag({ types: [MIME_FILE] }), MIME_FILE)).toBe(true)
    expect(hasType(fakeDrag({ types: ["Files"] }), MIME_FILE)).toBe(false)
  })

  it("readFilePayload parses valid payloads and rejects junk", () => {
    expect(readFilePayload(fakeDrag({ data: filePayload("a1", "f1") }))).toEqual({ fileId: "a1", sourceFolderId: "f1" })
    expect(readFilePayload(fakeDrag({ data: { [MIME_FILE]: JSON.stringify({ fileId: "a1" }) } }))).toEqual({ fileId: "a1", sourceFolderId: null })
    expect(readFilePayload(fakeDrag())).toBeNull()
    expect(readFilePayload(fakeDrag({ data: { [MIME_FILE]: "{not json" } }))).toBeNull()
    expect(readFilePayload(fakeDrag({ data: { [MIME_FILE]: JSON.stringify({ fileId: 3 }) } }))).toBeNull()
  })
})

describe("useAttachmentDnd", () => {
  it("drag start records the dragged file and writes the payload", () => {
    const { result } = renderHook(() => useAttachmentDnd(fakeApi()))
    const e = fakeDrag()
    act(() => result.current.onFileDragStart(e, "a1", "f1"))
    expect(result.current.draggingFileId).toBe("a1")
    expect(e.dataTransfer.effectAllowed).toBe("move")
    expect(readFilePayload(e)).toEqual({ fileId: "a1", sourceFolderId: "f1" })
    act(() => result.current.clear())
    expect(result.current.draggingFileId).toBeNull()
  })

  it("row drag over shows the insert line for internal drags and allows copy for OS files", () => {
    const { result } = renderHook(() => useAttachmentDnd(fakeApi()))
    const internal = fakeDrag({ types: [MIME_FILE] })
    act(() => result.current.onRowDragOver(internal, "a2"))
    expect(internal.preventDefault).toHaveBeenCalled()
    expect(internal.dataTransfer.dropEffect).toBe("move")
    expect(result.current.insertBeforeFileId).toBe("a2")

    const os = fakeDrag({ types: ["Files"] })
    act(() => result.current.onRowDragOver(os, "a3"))
    expect(os.dataTransfer.dropEffect).toBe("copy")
    expect(os.stopPropagation).not.toHaveBeenCalled()
    expect(result.current.insertBeforeFileId).toBe("a2")

    const other = fakeDrag({ types: ["text/plain"] })
    act(() => result.current.onRowDragOver(other, "a3"))
    expect(other.preventDefault).not.toHaveBeenCalled()
  })

  it("row drop inserts the file before the target row; non-kanflow drops bubble", () => {
    const api = fakeApi()
    const { result } = renderHook(() => useAttachmentDnd(api))
    const osDrop = fakeDrag({ types: ["Files"] })
    act(() => result.current.onRowDrop(osDrop, "a2", "f1"))
    expect(osDrop.preventDefault).not.toHaveBeenCalled()
    expect(api.placeAttachment).not.toHaveBeenCalled()

    act(() => result.current.onRowDrop(fakeDrag({ data: filePayload("a1", null) }), "a2", "f1"))
    expect(api.placeAttachment).toHaveBeenCalledWith("a1", null, "f1", "a2")
  })

  it("zone drag over / leave tracks the highlighted zone", () => {
    const { result } = renderHook(() => useAttachmentDnd(fakeApi()))
    act(() => result.current.onZoneDragOver(fakeDrag({ types: [MIME_FOLDER] }), "f1"))
    expect(result.current.dropTarget).toBe("f1")
    const os = fakeDrag({ types: ["Files"] })
    act(() => result.current.onZoneDragOver(os, ZONE_UNFILED))
    expect(os.dataTransfer.dropEffect).toBe("copy")
    expect(result.current.dropTarget).toBe(ZONE_UNFILED)
    const ignored = fakeDrag({ types: ["text/plain"] })
    act(() => result.current.onZoneDragOver(ignored, "f2"))
    expect(ignored.preventDefault).not.toHaveBeenCalled()

    act(() => result.current.onZoneDragLeave(fakeDrag({ contains: true })))
    expect(result.current.dropTarget).toBe(ZONE_UNFILED)
    act(() => result.current.onZoneDragLeave(fakeDrag({ contains: false })))
    expect(result.current.dropTarget).toBeNull()
  })

  it("zone drop uploads OS files, moves folders and files, and ignores no-op drops", () => {
    const api = fakeApi()
    const { result } = renderHook(() => useAttachmentDnd(api))
    const file = new File(["x"], "a.txt")
    act(() => result.current.onZoneDrop(fakeDrag({ files: [file] }), "f1"))
    expect(api.uploadFiles).toHaveBeenCalledWith([file], "f1")

    act(() => result.current.onZoneDrop(fakeDrag({ data: { [MIME_FOLDER]: "f2" } }), "f1"))
    expect(api.placeFolder).toHaveBeenCalledWith("f2", "f1", Number.POSITIVE_INFINITY)
    act(() => result.current.onZoneDrop(fakeDrag({ data: { [MIME_FOLDER]: "f1" } }), "f1"))
    expect(api.placeFolder).toHaveBeenCalledTimes(1)

    act(() => result.current.onZoneDrop(fakeDrag({ data: filePayload("a1", "f2") }), null))
    expect(api.placeAttachment).toHaveBeenCalledWith("a1", "f2", null)
    act(() => result.current.onZoneDrop(fakeDrag({ data: filePayload("a1", "f1") }), "f1"))
    expect(api.placeAttachment).toHaveBeenCalledTimes(1)
  })

  it("page zone only reacts to OS files and uploads them unfiled", () => {
    const api = fakeApi()
    const { result } = renderHook(() => useAttachmentDnd(api))
    const internal = fakeDrag({ types: [MIME_FILE] })
    act(() => result.current.pageZone.onDragOver(internal))
    expect(internal.preventDefault).not.toHaveBeenCalled()

    act(() => result.current.pageZone.onDragOver(fakeDrag({ types: ["Files"] })))
    expect(result.current.dropTarget).toBe(ZONE_PAGE)
    act(() => result.current.pageZone.onDragLeave(fakeDrag({ contains: true })))
    expect(result.current.dropTarget).toBe(ZONE_PAGE)
    act(() => result.current.pageZone.onDragLeave(fakeDrag()))
    expect(result.current.dropTarget).toBeNull()

    act(() => result.current.pageZone.onDrop(fakeDrag()))
    expect(api.uploadFiles).not.toHaveBeenCalled()
    const file = new File(["x"], "b.txt")
    act(() => result.current.pageZone.onDrop(fakeDrag({ files: [file] })))
    expect(api.uploadFiles).toHaveBeenCalledWith([file], null)
  })
})

describe("useFolderDnd", () => {
  it("drag start writes folder id plus a text fallback; drag end clears and notifies", () => {
    const onFinished = vi.fn()
    const { result } = renderHook(() => useFolderDnd(fakeApi(), onFinished))
    const e = fakeDrag()
    act(() => result.current.onHeaderDragStart(e, "f1"))
    expect(result.current.draggingFolderId).toBe("f1")
    expect(e.dataTransfer.setData).toHaveBeenCalledWith(MIME_FOLDER, "f1")
    expect(e.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "folder:f1")
    act(() => result.current.onHeaderDragEnd())
    expect(result.current.draggingFolderId).toBeNull()
    expect(onFinished).toHaveBeenCalled()
  })

  it.each([
    [10, "before"],
    [50, "nest"],
    [90, "after"],
  ] as const)("folder drag at y=%i picks mode %s", (clientY, mode) => {
    const { result } = renderHook(() => useFolderDnd(fakeApi(), vi.fn()))
    act(() => result.current.onHeaderDragOver(fakeDrag({ types: [MIME_FOLDER], clientY }), "f2"))
    expect(result.current.hoverModeFor("f2")).toBe(mode)
    expect(result.current.hoverModeFor("other")).toBeNull()
  })

  it("files hovering a header always nest; unrelated drags are ignored", () => {
    const { result } = renderHook(() => useFolderDnd(fakeApi(), vi.fn()))
    const ignored = fakeDrag({ types: ["text/plain"] })
    act(() => result.current.onHeaderDragOver(ignored, "f1"))
    expect(ignored.preventDefault).not.toHaveBeenCalled()
    const os = fakeDrag({ types: ["Files"], clientY: 1 })
    act(() => result.current.onHeaderDragOver(os, "f1"))
    expect(os.dataTransfer.dropEffect).toBe("copy")
    expect(result.current.hoverModeFor("f1")).toBe("nest")

    act(() => result.current.onHeaderDragLeave(fakeDrag({ contains: true }), "f1"))
    expect(result.current.hoverModeFor("f1")).toBe("nest")
    act(() => result.current.onHeaderDragLeave(fakeDrag(), "other"))
    expect(result.current.hoverModeFor("f1")).toBe("nest")
    act(() => result.current.onHeaderDragLeave(fakeDrag(), "f1"))
    expect(result.current.hoverModeFor("f1")).toBeNull()
  })

  it("header drop dispatches upload / folder drop with hovered mode / file move", () => {
    const api = fakeApi()
    const onFinished = vi.fn()
    const { result } = renderHook(() => useFolderDnd(api, onFinished))
    const file = new File(["x"], "c.txt")
    act(() => result.current.onHeaderDrop(fakeDrag({ files: [file] }), "f1"))
    expect(api.uploadFiles).toHaveBeenCalledWith([file], "f1")
    expect(onFinished).toHaveBeenCalled()

    act(() => result.current.onHeaderDragOver(fakeDrag({ types: [MIME_FOLDER], clientY: 5 }), "f1"))
    act(() => result.current.onHeaderDrop(fakeDrag({ data: { [MIME_FOLDER]: "f3" } }), "f1"))
    expect(api.dropFolder).toHaveBeenCalledWith("f3", "f1", "before")
    // Without a hover on the target the default intent is "nest".
    act(() => result.current.onHeaderDrop(fakeDrag({ data: { [MIME_FOLDER]: "f3" } }), "f2"))
    expect(api.dropFolder).toHaveBeenLastCalledWith("f3", "f2", "nest")
    act(() => result.current.onHeaderDrop(fakeDrag({ data: { [MIME_FOLDER]: "f2" } }), "f2"))
    expect(api.dropFolder).toHaveBeenCalledTimes(2)

    act(() => result.current.onHeaderDrop(fakeDrag({ data: filePayload("a1", null) }), "f2"))
    expect(api.placeAttachment).toHaveBeenCalledWith("a1", null, "f2")
    act(() => result.current.onHeaderDrop(fakeDrag({ data: filePayload("a1", "f2") }), "f2"))
    expect(api.placeAttachment).toHaveBeenCalledTimes(1)
  })
})
